// 알림 서비스 (CRUD + 실시간 소켓 전송)
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private supabaseService: SupabaseService,
    private notificationsGateway: NotificationsGateway,
  ) {}

  // GET /api/notifications — 커서 기반 페이지네이션
  async getNotifications(userId: string, cursor?: string, limit = 20) {
    const client = this.supabaseService.getClient();
    const safeLimit = Math.min(limit, 50);

    let query = client
      .from('notifications')
      .select('id, type, title, body, data, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(safeLimit + 1);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) throw error;

    const items = data || [];
    const hasMore = items.length > safeLimit;
    if (hasMore) items.pop();

    return {
      notifications: items,
      nextCursor: hasMore ? items[items.length - 1].created_at : null,
      hasMore,
    };
  }

  // GET /api/notifications/unread-count — 읽지 않은 알림 수
  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return count ?? 0;
  }

  // PATCH /api/notifications/:id/read — 단건 읽음 처리
  async markRead(userId: string, notificationId: string) {
    const client = this.supabaseService.getClient();

    const { data: notif, error: findErr } = await client
      .from('notifications')
      .select('user_id')
      .eq('id', notificationId)
      .single();

    if (findErr || !notif) throw new NotFoundException('존재하지 않는 알림입니다');
    if (notif.user_id !== userId) throw new ForbiddenException('본인 알림만 읽음 처리할 수 있습니다');

    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
    return { success: true };
  }

  // PATCH /api/notifications/read-all — 전체 읽음 처리
  async markAllRead(userId: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return { success: true };
  }

  // 알림 생성 + 소켓 실시간 전송 (내부용)
  async createNotification(
    userId: string,
    payload: {
      type: 'comment' | 'like';
      title: string;
      body: string;
      data?: Record<string, unknown>;
    },
  ) {
    const client = this.supabaseService.getClient();

    const { data: notif, error } = await client
      .from('notifications')
      .insert({
        user_id: userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
      })
      .select('id, type, title, body, data, is_read, created_at')
      .single();

    if (error) throw error;

    // 실시간 소켓 전송
    this.notificationsGateway.sendToUser(userId, notif);

    return notif;
  }
}
