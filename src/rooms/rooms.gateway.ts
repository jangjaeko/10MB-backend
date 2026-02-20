// 대화방 WebSocket 게이트웨이 (입장/퇴장 실시간 동기화, 연결 해제 시 자동 퇴장)
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomsService } from './rooms.service';
import { AuthService } from '../auth/auth.service';

@WebSocketGateway({
  cors: {
    origin: (process.env.FRONTEND_URL || 'http://localhost:3000')
      .split(',')
      .map((url) => url.trim()),
    credentials: true,
  },
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // socketId → userId
  private connectedUsers: Map<string, string> = new Map();

  constructor(
    private roomsService: RoomsService,
    private authService: AuthService,
  ) {}

  // 소켓 연결 시 JWT 검증
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }
      const user = await this.authService.verifyToken(token);
      this.connectedUsers.set(client.id, user.userId);
    } catch {
      client.disconnect();
    }
  }

  // 소켓 연결 해제 시 자동 퇴장
  async handleDisconnect(client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    this.connectedUsers.delete(client.id);

    try {
      const leftRoomIds = await this.roomsService.leaveAllRooms(userId);
      // 퇴장한 방들의 인원수 브로드캐스트
      for (const roomId of leftRoomIds) {
        await this.broadcastRoomUpdate(roomId);
      }
    } catch (err) {
      console.error('[RoomsGW] 자동 퇴장 실패:', err);
    }
  }

  // room:join — 대화방 입장
  @SubscribeMessage('room:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    try {
      await this.roomsService.joinRoom(userId, data.roomId);
      await this.broadcastRoomUpdate(data.roomId);
      client.emit('room:joined', { roomId: data.roomId });
    } catch (err) {
      client.emit('room:error', {
        message: err instanceof Error ? err.message : '입장에 실패했습니다',
      });
    }
  }

  // room:leave — 대화방 퇴장
  @SubscribeMessage('room:leave')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    try {
      await this.roomsService.leaveRoom(userId, data.roomId);
      await this.broadcastRoomUpdate(data.roomId);
      client.emit('room:left', { roomId: data.roomId });
    } catch (err) {
      client.emit('room:error', {
        message: err instanceof Error ? err.message : '퇴장에 실패했습니다',
      });
    }
  }

  // 인원수 변경 브로드캐스트
  private async broadcastRoomUpdate(roomId: string) {
    try {
      const rooms = await this.roomsService.getRooms();
      const room = rooms.find((r: any) => r.id === roomId);
      if (room) {
        this.server.emit('room:update', {
          roomId,
          currentParticipants: room.current_participants,
        });
      }
    } catch (err) {
      console.error('[RoomsGW] 브로드캐스트 실패:', err);
    }
  }
}
