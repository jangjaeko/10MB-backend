// 음성 통화 컨트롤러 (Agora 토큰 발급)
import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  // POST /api/voice/token — Agora RTC 토큰 발급 (인증 필요)
  @Post('token')
  @UseGuards(AuthGuard)
  async getToken(
    @Request() req: any,
    @Body('channelId') channelId: string,
  ) {
    return this.voiceService.generateToken(req.user.userId, channelId);
  }

}
