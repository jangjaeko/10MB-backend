// 매칭 모듈 (매칭 서비스, 게이트웨이, 타이머, Bull 큐 등록)
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MatchController } from './match.controller';
import { MatchService } from './match.service';
import { MatchGateway } from './match.gateway';
import { MatchTimerService } from './match-timer.service';
import { MatchQueueProcessor } from './match-queue.processor';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    BullModule.registerQueue({ name: 'match-queue' }),
  ],
  controllers: [MatchController],
  providers: [MatchService, MatchGateway, MatchTimerService, MatchQueueProcessor],
  exports: [MatchService],
})
export class MatchModule {}
