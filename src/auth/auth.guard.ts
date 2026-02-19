// JWT 인증 가드 (Authorization Bearer 토큰 추출 → Supabase 검증)
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  // 요청 헤더에서 Bearer 토큰을 추출하고 Supabase로 검증
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('인증 토큰이 필요합니다');
    }

    const token = authHeader.substring(7);

    try {
      const user = await this.authService.verifyToken(token);
      // request.user에 { userId, email }을 주입하여 컨트롤러에서 사용 가능
      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
    }
  }
}
