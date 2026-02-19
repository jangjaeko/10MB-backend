// 매칭 컨트롤러 (매칭 시작/취소/평가, 온라인 수, Redis 테스트)
import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MatchService } from './match.service';
import { AuthGuard } from '../auth/auth.guard';
import { StartMatchDto } from './dto/start-match.dto';
import { RateMatchDto } from './dto/rate-match.dto';
import { RedisService } from '../common/redis/redis.service';

@Controller('match')
export class MatchController {
  constructor(
    private readonly matchService: MatchService,
    private readonly redisService: RedisService,
  ) {}

  @Post('start')
  @UseGuards(AuthGuard)
  async startMatch(@Request() req: any, @Body() dto: StartMatchDto) {
    return this.matchService.startMatch(req.user.userId, dto.interests);
  }

  @Delete('cancel')
  @UseGuards(AuthGuard)
  async cancelMatch(@Request() req: any) {
    return this.matchService.cancelMatch(req.user.userId);
  }

  @Post(':id/rate')
  @UseGuards(AuthGuard)
  async rateMatch(
    @Request() req: any,
    @Param('id') sessionId: string,
    @Body() dto: RateMatchDto,
  ) {
    return this.matchService.rateMatch(req.user.userId, sessionId, dto.rating);
  }

  @Get('online-count')
  async getOnlineCount() {
    return this.matchService.getOnlineCount();
  }

  // GET /api/match/redis-test — Redis 연결 확인
  @Get('redis-test')
  async redisTest() {
    const result = await this.redisService.ping();
    return { redis: result };
  }
}
