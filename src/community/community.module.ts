// 커뮤니티 게시판 모듈
import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
