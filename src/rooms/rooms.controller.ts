// 대화방 컨트롤러 (목록 조회, 입장, 퇴장)
import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  // 대화방 목록 조회
  @Get()
  @UseGuards(AuthGuard)
  async getRooms() {
    return this.roomsService.getRooms();
  }

  // 대화방 입장
  @Post(':id/join')
  @UseGuards(AuthGuard)
  async joinRoom(@Request() req: any, @Param('id') roomId: string) {
    return this.roomsService.joinRoom(req.user.userId, roomId);
  }

  // 대화방 퇴장
  @Post(':id/leave')
  @UseGuards(AuthGuard)
  async leaveRoom(@Request() req: any, @Param('id') roomId: string) {
    return this.roomsService.leaveRoom(req.user.userId, roomId);
  }
}
