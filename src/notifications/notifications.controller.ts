// 알림 API 컨트롤러
import { Controller, Get, Patch, Param, Query, UseGuards, Req, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  // GET /api/notifications?cursor=&limit=20
  @Get()
  getNotifications(
    @Req() req: any,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.notificationsService.getNotifications(req.user.userId, cursor, limit);
  }

  // GET /api/notifications/unread-count
  // ⚠️ :id 라우트보다 먼저 정의해야 충돌 없음
  @Get('unread-count')
  getUnreadCount(@Req() req: any) {
    return this.notificationsService.getUnreadCount(req.user.userId).then((count) => ({ count }));
  }

  // PATCH /api/notifications/read-all
  @Patch('read-all')
  markAllRead(@Req() req: any) {
    return this.notificationsService.markAllRead(req.user.userId);
  }

  // PATCH /api/notifications/:id/read
  @Patch(':id/read')
  markRead(@Req() req: any, @Param('id') id: string) {
    return this.notificationsService.markRead(req.user.userId, id);
  }
}
