// 알림 전용 게이트웨이 (notification:new 실시간 전송)
// MatchGateway와 동일 포트를 공유하므로 server 인스턴스가 동일함.
// handleConnection은 MatchGateway에서만 처리하고,
// 여기서는 server.to(room).emit(...) 으로 특정 유저에게 이벤트만 발송.
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: (process.env.FRONTEND_URL || 'http://localhost:3000')
      .split(',')
      .map((url) => url.trim()),
    credentials: true,
  },
})
export class NotificationsGateway {
  @WebSocketServer()
  server: Server;

  // 특정 유저에게 notification:new 이벤트 전송
  // 유저는 MatchGateway.handleConnection에서 'notif:{userId}' 룸에 조인됨
  sendToUser(userId: string, notification: Record<string, unknown>) {
    this.server.to(`notif:${userId}`).emit('notification:new', notification);
  }
}
