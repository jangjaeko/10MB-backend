// 매칭 WebSocket 게이트웨이 (JWT 인증, 매칭 이벤트, 타이머, 파트너 알림)
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchService } from './match.service';
import { MatchTimerService } from './match-timer.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { SupabaseService } from '../common/supabase/supabase.service';

// 활성 세션 정보 (파트너 추적용)
interface ActiveSessionInfo {
  sessionId: string;
  userIds: string[];
}

@WebSocketGateway({
  cors: {
    origin: (process.env.FRONTEND_URL || 'http://localhost:3000')
      .split(',')
      .map((url) => url.trim()),
    credentials: true,
  },
})
export class MatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // socketId → userId
  private connectedUsers: Map<string, string> = new Map();
  // userId → sessionId (활성 세션 추적)
  private userSessions: Map<string, string> = new Map();
  // sessionId → ActiveSessionInfo
  private activeSessions: Map<string, ActiveSessionInfo> = new Map();
  // userId → 요청 타임스탬프 배열 (Rate Limit용)
  private matchRateLimit: Map<string, number[]> = new Map();
  // sessionId → 연장 동의 유저 Set (양쪽 동의 추적)
  private extendRequests: Map<string, Set<string>> = new Map();

  constructor(
    private matchService: MatchService,
    private matchTimerService: MatchTimerService,
    private authService: AuthService,
    private usersService: UsersService,
    private supabaseService: SupabaseService,
  ) {}

  // 소켓 연결 시 JWT 토큰 검증
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) {
        client.emit('match:error', { message: '인증 토큰이 없습니다' });
        client.disconnect();
        return;
      }

      const user = await this.authService.verifyToken(token);
      this.connectedUsers.set(client.id, user.userId);

      await this.usersService.setUserOnline(user.userId, true);
      console.log(`[WS] User ${user.userId} connected (${client.id})`);
    } catch {
      client.emit('match:error', { message: '인증에 실패했습니다' });
      client.disconnect();
    }
  }

  // 소켓 연결 해제 시 정리 (대기열 제거, 파트너 알림, 오프라인 처리)
  async handleDisconnect(client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    this.connectedUsers.delete(client.id);
    this.matchRateLimit.delete(userId);
    await this.matchService.removeFromQueue(userId);
    await this.notifyPartnerLeft(userId);
    await this.usersService.setUserOnline(userId, false);

    console.log(`[WS] User ${userId} disconnected`);
  }

  // match:start — 매칭 시작 요청 (Rate Limit + 중복 매칭 방지)
  @SubscribeMessage('match:start')
  async handleMatchStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interests: string[] },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    // Rate Limit 체크 (분당 5회)
    if (!this.checkRateLimit(userId)) {
      client.emit('match:error', {
        message: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.',
      });
      return;
    }

    try {
      const result = await this.matchService.startMatch(userId, data.interests);

      if (result.matched) {
        const { sessionId, partnerId, partner, commonInterests } = result;

        // 활성 세션 등록
        const sessionInfo: ActiveSessionInfo = {
          sessionId,
          userIds: [userId, partnerId],
        };
        this.activeSessions.set(sessionId, sessionInfo);
        for (const uid of sessionInfo.userIds) {
          this.userSessions.set(uid, sessionId);
        }

        // 요청자에게 match:found 전송
        client.emit('match:found', {
          sessionId,
          partnerId,
          partner,
          commonInterests,
          agoraChannelId: `10mb-${sessionId}`,
          agoraToken: '',
        });

        // 파트너에게 match:found 전송 (요청자 정보 포함)
        const requester = await this.usersService.getUserById(userId);
        this.emitToUser(partnerId, 'match:found', {
          sessionId,
          partnerId: userId,
          partner: {
            nickname: requester.nickname,
            interests: requester.interests,
          },
          commonInterests,
          agoraChannelId: `10mb-${sessionId}`,
          agoraToken: '',
        });

        // 10분 타이머 시작
        this.startSessionTimer(sessionId, sessionInfo);
      } else if (result.message === '이미 매칭 중입니다') {
        // 중복 매칭 방지: 이미 매칭 중인 경우 에러 전송
        client.emit('match:error', { message: result.message });
      } else {
        // 대기열에 추가됨 → 검색 중 상태 전송
        client.emit('match:searching', {
          waitingCount: this.matchService.getWaitingCount(),
        });
      }
    } catch (err) {
      client.emit('match:error', {
        message: err instanceof Error ? err.message : '매칭 시작에 실패했습니다',
      });
    }
  }

  // match:cancel — 매칭 취소 요청
  @SubscribeMessage('match:cancel')
  async handleMatchCancel(@ConnectedSocket() client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    try {
      await this.matchService.cancelMatch(userId);
      client.emit('match:cancelled', {});
    } catch (err) {
      client.emit('match:error', {
        message: err instanceof Error ? err.message : '매칭 취소에 실패했습니다',
      });
    }
  }

  // match:leave — 통화방 나가기
  @SubscribeMessage('match:leave')
  async handleMatchLeave(@ConnectedSocket() client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    await this.notifyPartnerLeft(userId);
  }

  // match:extend_request — 연장 요청 (요청자 → 상대방에게 전달)
  @SubscribeMessage('match:extend_request')
  async handleExtendRequest(@ConnectedSocket() client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    // 1회 제한: DB extended 플래그 확인
    try {
      const session = await this.supabaseService.getMatchSession(sessionId);
      if (session.extended) {
        client.emit('match:error', { message: '이미 연장이 사용되었습니다' });
        return;
      }
    } catch (err) {
      console.error('[Extend] 세션 조회 실패:', err);
      return;
    }

    // 연장 요청 추적에 요청자 추가
    if (!this.extendRequests.has(sessionId)) {
      this.extendRequests.set(sessionId, new Set());
    }
    this.extendRequests.get(sessionId)!.add(userId);

    // 상대방에게 연장 요청 전달
    const sessionInfo = this.activeSessions.get(sessionId);
    if (sessionInfo) {
      const partnerIds = sessionInfo.userIds.filter((id) => id !== userId);
      for (const partnerId of partnerIds) {
        this.emitToUser(partnerId, 'match:extend_request', {});
      }
    }

    console.log(`[Extend] 요청: ${userId} (세션: ${sessionId})`);
  }

  // match:extend_response — 연장 응답 (수락/거절)
  @SubscribeMessage('match:extend_response')
  async handleExtendResponse(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { accept: boolean },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const sessionInfo = this.activeSessions.get(sessionId);
    if (!sessionInfo) return;

    if (!data.accept) {
      // 거절: 요청자에게 거절 알림 전송
      const requesters = this.extendRequests.get(sessionId);
      if (requesters) {
        for (const requesterId of requesters) {
          if (requesterId !== userId) {
            this.emitToUser(requesterId, 'match:extend_rejected', {});
          }
        }
      }
      this.extendRequests.delete(sessionId);
      console.log(`[Extend] 거절: ${userId} (세션: ${sessionId})`);
      return;
    }

    // 수락: 응답자도 동의 Set에 추가
    if (!this.extendRequests.has(sessionId)) {
      this.extendRequests.set(sessionId, new Set());
    }
    this.extendRequests.get(sessionId)!.add(userId);

    const agreed = this.extendRequests.get(sessionId)!;
    const allAgreed = sessionInfo.userIds.every((uid) => agreed.has(uid));

    if (allAgreed) {
      // 양쪽 동의: 타이머 연장
      const addedSeconds = 300;
      const newRemaining = await this.matchTimerService.extendTimer(sessionId, addedSeconds);

      // 양쪽에게 승인 알림
      for (const uid of sessionInfo.userIds) {
        this.emitToUser(uid, 'match:extend_approved', {
          addedSeconds,
          newRemaining: newRemaining ?? 0,
        });
      }

      this.extendRequests.delete(sessionId);
      console.log(`[Extend] 승인: 세션 ${sessionId} (+${addedSeconds}초)`);
    }
  }

  // user:online — 온라인 상태 갱신
  @SubscribeMessage('user:online')
  async handleUserOnline(@ConnectedSocket() client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (userId) {
      await this.usersService.setUserOnline(userId, true);
    }
  }

  // 세션 타이머 시작 (10분 카운트다운)
  private startSessionTimer(
    sessionId: string,
    sessionInfo: ActiveSessionInfo,
  ) {
    this.matchTimerService.startTimer(
      sessionId,
      sessionInfo.userIds,
      // 매초 남은 시간 동기화
      (remainingSeconds: number) => {
        for (const uid of sessionInfo.userIds) {
          this.emitToUser(uid, 'match:timer_sync', { remainingSeconds });
        }
      },
      // 2분 남았을 때 경고
      () => {
        for (const uid of sessionInfo.userIds) {
          this.emitToUser(uid, 'match:timer_warning', {});
        }
      },
      // 타이머 종료 시 활성 플래그 해제
      async () => {
        for (const uid of sessionInfo.userIds) {
          this.emitToUser(uid, 'match:timer_end', {});
          this.userSessions.delete(uid);
          await this.matchService.endMatch(uid);
        }
        this.activeSessions.delete(sessionId);
      },
    );
  }

  // 파트너에게 나감 알림 전송 및 세션 정리 (활성 플래그 해제 포함)
  private async notifyPartnerLeft(userId: string) {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.activeSessions.get(sessionId);
    if (session) {
      const partnerIds = session.userIds.filter((id) => id !== userId);
      for (const partnerId of partnerIds) {
        this.emitToUser(partnerId, 'match:partner_left', {});
        this.userSessions.delete(partnerId);
        await this.matchService.endMatch(partnerId);
      }
    }

    this.matchTimerService.stopTimer(sessionId);
    this.userSessions.delete(userId);
    this.activeSessions.delete(sessionId);
    await this.matchService.endMatch(userId);
  }

  // Rate Limit 체크 (분당 maxRequests회 제한)
  private checkRateLimit(userId: string, maxRequests = 5): boolean {
    const now = Date.now();
    const timestamps = this.matchRateLimit.get(userId) || [];
    const recent = timestamps.filter((t) => now - t < 60000);
    if (recent.length >= maxRequests) return false;
    recent.push(now);
    this.matchRateLimit.set(userId, recent);
    return true;
  }

  // 특정 유저에게 이벤트 전송 (userId → socketId 역매핑)
  private emitToUser(userId: string, event: string, data: any) {
    for (const [socketId, uid] of this.connectedUsers.entries()) {
      if (uid === userId) {
        this.server.to(socketId).emit(event, data);
        break;
      }
    }
  }
}
