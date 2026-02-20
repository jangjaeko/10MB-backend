// 대화방 WebSocket 게이트웨이 (입장/퇴장 실시간 동기화, 참여자 목록, 자동 퇴장)
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
import { SupabaseService } from '../common/supabase/supabase.service';

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
  // userId → nickname (빠른 조회용 캐시)
  private userNicknames: Map<string, string> = new Map();

  constructor(
    private roomsService: RoomsService,
    private authService: AuthService,
    private supabaseService: SupabaseService,
  ) {}

  // 소켓 연결 시 JWT 검증 + 닉네임 캐시
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }
      const user = await this.authService.verifyToken(token);
      this.connectedUsers.set(client.id, user.userId);

      // 닉네임 캐시
      try {
        const userData = await this.supabaseService.getUserById(user.userId);
        this.userNicknames.set(user.userId, userData.nickname ?? '알 수 없음');
      } catch {
        this.userNicknames.set(user.userId, '알 수 없음');
      }
    } catch {
      client.disconnect();
    }
  }

  // 소켓 연결 해제 시 자동 퇴장 + 참여자 목록 브로드캐스트
  async handleDisconnect(client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    const nickname = this.userNicknames.get(userId) ?? '알 수 없음';
    this.connectedUsers.delete(client.id);
    this.userNicknames.delete(userId);

    try {
      const leftRoomIds = await this.roomsService.leaveAllRooms(userId);
      for (const roomId of leftRoomIds) {
        await this.broadcastRoomUpdate(roomId);
        await this.broadcastParticipants(roomId);
        this.server.emit('room:user_left', { roomId, user: { userId, nickname } });
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
      await this.broadcastParticipants(data.roomId);

      const nickname = this.userNicknames.get(userId) ?? '알 수 없음';
      this.server.emit('room:user_joined', {
        roomId: data.roomId,
        user: { userId, nickname },
      });

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
      const nickname = this.userNicknames.get(userId) ?? '알 수 없음';
      await this.roomsService.leaveRoom(userId, data.roomId);
      await this.broadcastRoomUpdate(data.roomId);
      await this.broadcastParticipants(data.roomId);

      this.server.emit('room:user_left', {
        roomId: data.roomId,
        user: { userId, nickname },
      });

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
      console.error('[RoomsGW] 인원수 브로드캐스트 실패:', err);
    }
  }

  // 참여자 목록 브로드캐스트
  private async broadcastParticipants(roomId: string) {
    try {
      const participants = await this.roomsService.getRoomParticipants(roomId);
      this.server.emit('room:participants', { roomId, participants });
    } catch (err) {
      console.error('[RoomsGW] 참여자 브로드캐스트 실패:', err);
    }
  }
}
