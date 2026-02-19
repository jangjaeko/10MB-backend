// 세션별 10분 타이머 관리 서비스 (setInterval 기반, 콜백으로 이벤트 전달)
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

// 타이머 상수
const TOTAL_SECONDS = 600;     // 10분
const WARNING_SECONDS = 120;   // 2분 남음 경고

// 세션 타이머 정보
interface TimerEntry {
  intervalId: ReturnType<typeof setInterval>;
  remainingSeconds: number;
}

@Injectable()
export class MatchTimerService implements OnModuleDestroy {
  // sessionId → TimerEntry
  private timers: Map<string, TimerEntry> = new Map();

  constructor(private supabaseService: SupabaseService) {}

  // 모듈 종료 시 모든 타이머 정리
  onModuleDestroy() {
    for (const [sessionId] of this.timers) {
      this.stopTimer(sessionId);
    }
  }

  // 타이머 시작 (매칭 완료 시 게이트웨이에서 호출)
  startTimer(
    sessionId: string,
    userIds: string[],
    onTick: (remainingSeconds: number) => void,
    onWarning: () => void,
    onEnd: () => Promise<void>,
  ) {
    // 중복 방지
    if (this.timers.has(sessionId)) {
      console.warn(`[Timer] 이미 실행 중: ${sessionId}`);
      return;
    }

    let remainingSeconds = TOTAL_SECONDS;
    let warningEmitted = false;

    // DB에 세션 시작 시간 + 종료 예정 시간 기록
    const now = new Date();
    const endsAt = new Date(now.getTime() + TOTAL_SECONDS * 1000);
    this.supabaseService
      .updateMatchSession(sessionId, {
        status: 'active',
        started_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .catch((err) => console.error('[Timer] 세션 시작 업데이트 실패:', err));

    console.log(`[Timer] 시작: ${sessionId} (${TOTAL_SECONDS}초, 유저: ${userIds.join(', ')})`);

    // 매초 실행
    const intervalId = setInterval(async () => {
      remainingSeconds--;

      // 남은 시간 갱신
      const entry = this.timers.get(sessionId);
      if (entry) entry.remainingSeconds = remainingSeconds;

      // 매초 동기화 콜백
      onTick(remainingSeconds);

      // 2분 남음 경고 (1회만)
      if (remainingSeconds === WARNING_SECONDS && !warningEmitted) {
        warningEmitted = true;
        onWarning();
        console.log(`[Timer] 2분 경고: ${sessionId}`);
      }

      // 타이머 종료
      if (remainingSeconds <= 0) {
        this.clearTimer(sessionId);

        // DB 세션 상태 → completed
        try {
          await this.supabaseService.updateMatchSession(sessionId, {
            status: 'completed',
            actual_ended_at: new Date().toISOString(),
          });
        } catch (err) {
          console.error('[Timer] 세션 완료 업데이트 실패:', err);
        }

        // 게이트웨이 콜백 (timer_end 이벤트 + 활성 플래그 해제)
        await onEnd();
        console.log(`[Timer] 종료: ${sessionId}`);
      }
    }, 1000);

    this.timers.set(sessionId, { intervalId, remainingSeconds });
  }

  // 타이머 중지 (중간 이탈 시 게이트웨이에서 호출)
  stopTimer(sessionId: string) {
    const cleared = this.clearTimer(sessionId);
    if (!cleared) return;

    // DB 세션 상태 → completed (중간 종료)
    this.supabaseService
      .updateMatchSession(sessionId, {
        status: 'completed',
        actual_ended_at: new Date().toISOString(),
      })
      .catch((err) => console.error('[Timer] 중간 종료 업데이트 실패:', err));

    console.log(`[Timer] 중지: ${sessionId}`);
  }

  // 남은 시간 조회
  getRemainingSeconds(sessionId: string): number | null {
    const entry = this.timers.get(sessionId);
    return entry ? entry.remainingSeconds : null;
  }

  // 활성 타이머 수
  getActiveCount(): number {
    return this.timers.size;
  }

  // 인터벌 정리 (내부용, DB 업데이트 없음)
  private clearTimer(sessionId: string): boolean {
    const entry = this.timers.get(sessionId);
    if (!entry) return false;

    clearInterval(entry.intervalId);
    this.timers.delete(sessionId);
    return true;
  }
}
