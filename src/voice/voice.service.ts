// Agora RTC 토큰 생성 서비스 (채널 참가용 토큰 발급)
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

@Injectable()
export class VoiceService {
  private appId: string;
  private appCertificate: string;

  constructor(private configService: ConfigService) {
    this.appId = this.configService.get<string>('AGORA_APP_ID') || '';
    this.appCertificate =
      this.configService.get<string>('AGORA_APP_CERTIFICATE') || '';
  }

  // Agora RTC 토큰 생성 (유효 시간: 600초 = 10분)
  async generateToken(
    userId: string,
    channelId: string,
  ): Promise<{ token: string; channelId: string; uid: number }> {
    if (!this.appId || !this.appCertificate) {
      throw new BadRequestException('Agora 설정이 되어 있지 않습니다');
    }

    if (!channelId) {
      throw new BadRequestException('channelId가 필요합니다');
    }

    // userId 해시 → 숫자 UID 변환 (Agora는 숫자 UID 사용)
    const uid = this.generateNumericUid(userId);

    const expirationTimeInSeconds = 600; // 10분
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCertificate,
      channelId,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
    );

    return {
      token,
      channelId,
      uid,
    };
  }

  // userId 문자열 → 고정된 숫자 UID 변환
  private generateNumericUid(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // 32비트 정수 변환
    }
    return Math.abs(hash) % 1000000;
  }
}
