// Supabase 토큰 검증 서비스 (JWT → userId, email 추출)
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AuthService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  async verifyToken(token: string): Promise<{ userId: string; email: string }> {
    if (!this.supabase) {
      throw new UnauthorizedException('Auth service not configured');
    }

    const {
      data: { user },
      error,
    } = await this.supabase.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedException('Invalid token');
    }

    return {
      userId: user.id,
      email: user.email!,
    };
  }

  async getUserFromToken(token: string) {
    return this.verifyToken(token);
  }
}
