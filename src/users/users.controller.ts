// 사용자 컨트롤러 (프로필 조회/수정, 온보딩, 통계, 계정 삭제)
import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { OnboardingDto } from './dto/onboarding.dto';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // GET /api/users/me — 내 프로필 조회
  @Get('me')
  async getMe(@Request() req: any) {
    return this.usersService.getUserById(req.user.userId);
  }

  // PATCH /api/users/me — 프로필 수정 (닉네임 중복 체크 포함)
  @Patch('me')
  async updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateUser(req.user.userId, dto);
  }

  // POST /api/users/onboarding — 온보딩 완료 (닉네임 + 관심사 설정)
  @Post('onboarding')
  async completeOnboarding(@Request() req: any, @Body() dto: OnboardingDto) {
    return this.usersService.completeOnboarding(
      req.user.userId,
      req.user.email,
      dto,
    );
  }

  // GET /api/users/check-nickname?nickname=xxx — 닉네임 중복 체크
  @Get('check-nickname')
  async checkNickname(@Request() req: any, @Query('nickname') nickname: string) {
    return this.usersService.checkNickname(nickname, req.user.userId);
  }

  // GET /api/users/me/stats — 내 통화 통계 조회
  @Get('me/stats')
  async getStats(@Request() req: any) {
    return this.usersService.getUserStats(req.user.userId);
  }

  // DELETE /api/users/me — 계정 삭제
  @Delete('me')
  async deleteAccount(@Request() req: any) {
    return this.usersService.deleteUser(req.user.userId);
  }
}
