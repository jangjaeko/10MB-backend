// 매칭 큐 프로세서 (Bull Queue 작업 처리)
import { Process, Processor } from '@nestjs/bull';
import * as Bull from 'bull';

@Processor('match-queue')
export class MatchQueueProcessor {
  // 기본 작업 처리 (로그 출력)
  @Process()
  async handleMatchJob(job: Bull.Job) {
    console.log(`[match-queue] 작업 처리 시작: ${job.id}`, job.data);
  }
}
