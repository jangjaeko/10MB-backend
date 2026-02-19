// 사용자 관리 서비스 (프로필 CRUD, 온보딩, 닉네임 중복 체크)
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { OnboardingDto } from './dto/onboarding.dto';

@Injectable()
export class UsersService {
  constructor(private supabaseService: SupabaseService) {}

  // ID로 사용자 조회
  async getUserById(id: string) {
    try {
      return await this.supabaseService.getUserById(id);
    } catch {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }
  }

  // 프로필 수정 (닉네임 중복 체크 포함)
  async updateUser(id: string, dto: UpdateProfileDto) {
    if (dto.nickname) {
      const taken = await this.supabaseService.isNicknameTaken(dto.nickname, id);
      if (taken) {
        throw new ConflictException('이미 사용 중인 닉네임입니다');
      }
    }
    return this.supabaseService.updateUser(id, dto);
  }

  // 온보딩 완료 (닉네임 중복 체크 → 신규 생성 또는 업데이트)
  async completeOnboarding(userId: string, email: string, dto: OnboardingDto) {
    const taken = await this.supabaseService.isNicknameTaken(dto.nickname, userId);
    if (taken) {
      throw new ConflictException('이미 사용 중인 닉네임입니다');
    }

    let user = await this.supabaseService.getUserByEmail(email);

    if (!user) {
      user = await this.supabaseService.createUser({
        id: userId,
        email,
        nickname: dto.nickname,
        interests: dto.interests,
      });
    } else {
      user = await this.supabaseService.updateUser(userId, {
        nickname: dto.nickname,
        interests: dto.interests,
      });
    }

    return user;
  }

  // 닉네임 사용 가능 여부 확인
  async checkNickname(nickname: string, userId: string) {
    if (!nickname || nickname.length < 2) {
      return { available: false, message: '닉네임은 2자 이상이어야 합니다' };
    }
    const taken = await this.supabaseService.isNicknameTaken(nickname, userId);
    return {
      available: !taken,
      message: taken ? '이미 사용 중인 닉네임입니다' : '사용 가능한 닉네임입니다',
    };
  }

  // 사용자 통계 조회
  async getUserStats(id: string) {
    const user = await this.getUserById(id);
    return {
      totalCalls: user.total_calls,
      totalMinutes: user.total_minutes,
    };
  }

  // 계정 삭제 (DB 레코드 + Supabase Auth 삭제)
  async deleteUser(id: string) {
    const client = this.supabaseService.getClient();

    const { error: dbError } = await client
      .from('users')
      .delete()
      .eq('id', id);

    if (dbError) throw dbError;

    const { error: authError } = await client.auth.admin.deleteUser(id);
    if (authError) throw authError;

    return { success: true };
  }

  // 온라인 상태 변경
  async setUserOnline(id: string, isOnline: boolean) {
    return this.supabaseService.updateUser(id, { is_online: isOnline });
  }
}
