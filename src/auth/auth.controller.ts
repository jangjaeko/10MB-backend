// 인증 컨트롤러 (토큰 검증, 현재 유저 정보 반환)
import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { SupabaseService } from '../common/supabase/supabase.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly supabaseService: SupabaseService,
  ) {}

  // POST /api/auth/verify — 토큰 유효성 검증
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyToken(@Body('token') token: string) {
    return this.authService.verifyToken(token);
  }

  // GET /api/auth/me — 현재 로그인된 유저 정보 반환
  @Get('me')
  @UseGuards(AuthGuard)
  async getMe(@Request() req: any) {
    try {
      return await this.supabaseService.getUserById(req.user.userId);
    } catch {
      // DB에 유저가 없으면 기본 정보만 반환 (온보딩 전 신규 유저)
      return {
        id: req.user.userId,
        email: req.user.email,
        nickname: null,
        interests: [],
        total_calls: 0,
        total_minutes: 0,
      };
    }
  }
}
