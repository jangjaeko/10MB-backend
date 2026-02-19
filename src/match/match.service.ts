// 매칭 로직 서비스 (Redis 대기열 관리, 관심사 기반 매칭 알고리즘)
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { RedisService } from '../common/redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

// 대기열 유저 정보
interface WaitingUser {
  userId: string;
  interests: string[];
  joinedAt: number;
}

// 매칭 성공 결과
interface MatchResult {
  sessionId: string;
  partnerId: string;
  partner: { nickname: string; interests: string[] };
  commonInterests: string[];
}

// Redis 키 상수
const REDIS_KEYS = {
  QUEUE: 'match:queue',               // 대기열 Set (userId 목록)
  USER_DATA: (id: string) => `match:user:${id}`,  // 유저별 대기 정보 Hash
  ACTIVE: (id: string) => `match:active:${id}`,   // 활성 매칭 중인 유저 플래그
} as const;

@Injectable()
export class MatchService {
  // Redis 미연결 시 인메모리 폴백
  private memoryQueue: Map<string, WaitingUser> = new Map();
  private activeUsers: Set<string> = new Set();

  constructor(
    private supabaseService: SupabaseService,
    private redisService: RedisService,
  ) {}

  // 매칭 대기열에 추가 후 즉시 매칭 시도
  async startMatch(userId: string, interests: string[]) {
    // 이미 매칭 중인 유저 제외
    if (await this.isUserActive(userId)) {
      return {
        matched: false as const,
        message: '이미 매칭 중입니다',
      };
    }

    // 대기열에 추가
    await this.addToQueue(userId, interests);

    // 매칭 상대 탐색
    const match = await this.findMatch(userId, interests);

    if (match) {
      return {
        matched: true as const,
        sessionId: match.sessionId,
        partner: match.partner,
        partnerId: match.partnerId,
        commonInterests: match.commonInterests,
      };
    }

    return {
      matched: false as const,
      message: '대기열에 추가되었습니다',
    };
  }

  // 대기열에서 공통 관심사 1개 이상인 유저 찾기
  async findMatch(
    userId: string,
    interests: string[],
  ): Promise<MatchResult | null> {
    const waitingUsers = await this.getQueueUsers();

    // 공통 관심사 개수로 정렬할 후보 목록
    let bestMatch: { user: WaitingUser; commonInterests: string[] } | null = null;
    let bestScore = 0;

    for (const waiting of waitingUsers) {
      // 자기 자신 제외
      if (waiting.userId === userId) continue;
      // 이미 매칭 중인 유저 제외
      if (await this.isUserActive(waiting.userId)) continue;

      const commonInterests = interests.filter((i) =>
        waiting.interests.includes(i),
      );

      // 공통 관심사 1개 이상 필수
      if (commonInterests.length === 0) continue;

      // 가장 공통 관심사가 많은 유저 선택
      if (commonInterests.length > bestScore) {
        bestScore = commonInterests.length;
        bestMatch = { user: waiting, commonInterests };
      }
    }

    if (!bestMatch) return null;

    const partnerId = bestMatch.user.userId;
    const commonInterests = bestMatch.commonInterests;

    // 양쪽 대기열에서 제거
    await this.removeFromQueue(userId);
    await this.removeFromQueue(partnerId);

    // 양쪽 활성 매칭 플래그 설정
    await this.setUserActive(userId);
    await this.setUserActive(partnerId);

    // match_sessions 생성
    const channelId = `10mb-${uuidv4()}`;
    const session = await this.supabaseService.createMatchSession({
      status: 'matched',
      interests: commonInterests,
      agora_channel_id: channelId,
    });

    // match_participants 양쪽 생성
    await Promise.all([
      this.supabaseService.addMatchParticipant({
        session_id: session.id,
        user_id: userId,
      }),
      this.supabaseService.addMatchParticipant({
        session_id: session.id,
        user_id: partnerId,
      }),
    ]);

    const partner = await this.supabaseService.getUserById(partnerId);

    return {
      sessionId: session.id,
      partnerId,
      partner: {
        nickname: partner.nickname,
        interests: partner.interests,
      },
      commonInterests,
    };
  }

  // 매칭 취소 (대기열에서 제거)
  async cancelMatch(userId: string) {
    await this.removeFromQueue(userId);
    return { success: true };
  }

  // 매칭 종료 (활성 플래그 해제)
  async endMatch(userId: string) {
    await this.clearUserActive(userId);
  }

  // 통화 평가 + 유저 통계 업데이트 (total_calls + 1, total_minutes + 실제 통화 시간)
  async rateMatch(userId: string, sessionId: string, rating: string) {
    // 1. 평가 저장
    await this.supabaseService.updateMatchParticipant(sessionId, userId, {
      rating,
    });

    // 2. 세션 정보에서 실제 통화 시간 계산
    try {
      const session = await this.supabaseService.getMatchSession(sessionId);
      const user = await this.supabaseService.getUserById(userId);

      let actualMinutes = 10; // 기본 10분
      if (session?.started_at && session?.actual_ended_at) {
        const start = new Date(session.started_at).getTime();
        const end = new Date(session.actual_ended_at).getTime();
        actualMinutes = Math.max(1, Math.round((end - start) / 60000));
      }

      await this.supabaseService.updateUser(userId, {
        total_calls: (user.total_calls || 0) + 1,
        total_minutes: (user.total_minutes || 0) + actualMinutes,
      });
    } catch (err) {
      console.error('[Match] 유저 통계 업데이트 실패:', err);
    }

    return { success: true };
  }

  // 온라인 유저 수 조회
  async getOnlineCount() {
    try {
      const count = await this.supabaseService.getOnlineCount();
      return { count };
    } catch {
      return { count: this.memoryQueue.size };
    }
  }

  // 대기열 유저 수
  getWaitingCount(): number {
    return this.memoryQueue.size;
  }

  // --- 대기열 관리 (Redis 우선, 인메모리 폴백) ---

  // 대기열에 유저 추가
  private async addToQueue(userId: string, interests: string[]) {
    const userData: WaitingUser = { userId, interests, joinedAt: Date.now() };

    // 인메모리에 항상 보관 (폴백 + 빠른 조회)
    this.memoryQueue.set(userId, userData);

    // Redis에도 저장
    try {
      await this.redisService.sadd(REDIS_KEYS.QUEUE, userId);
      await this.redisService.set(
        REDIS_KEYS.USER_DATA(userId),
        JSON.stringify(userData),
        300, // 5분 TTL
      );
    } catch {
      // Redis 실패 시 인메모리만 사용
    }
  }

  // 대기열에서 유저 제거
  async removeFromQueue(userId: string) {
    this.memoryQueue.delete(userId);

    try {
      await this.redisService.srem(REDIS_KEYS.QUEUE, userId);
      await this.redisService.del(REDIS_KEYS.USER_DATA(userId));
    } catch {
      // Redis 실패 무시
    }
  }

  // 대기열 전체 유저 목록 조회
  private async getQueueUsers(): Promise<WaitingUser[]> {
    // 인메모리에서 조회 (빠름)
    return Array.from(this.memoryQueue.values());
  }

  // --- 활성 매칭 상태 관리 ---

  // 유저가 현재 매칭 중인지 확인
  private async isUserActive(userId: string): Promise<boolean> {
    if (this.activeUsers.has(userId)) return true;

    try {
      const val = await this.redisService.get(REDIS_KEYS.ACTIVE(userId));
      return val !== null;
    } catch {
      return false;
    }
  }

  // 활성 매칭 플래그 설정
  private async setUserActive(userId: string) {
    this.activeUsers.add(userId);

    try {
      await this.redisService.set(REDIS_KEYS.ACTIVE(userId), '1', 660); // 11분 TTL
    } catch {
      // Redis 실패 무시
    }
  }

  // 활성 매칭 플래그 해제
  async clearUserActive(userId: string) {
    this.activeUsers.delete(userId);

    try {
      await this.redisService.del(REDIS_KEYS.ACTIVE(userId));
    } catch {
      // Redis 실패 무시
    }
  }
}
