// 대화방 서비스 (목록 조회, 입장, 퇴장)
import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

@Injectable()
export class RoomsService {
  constructor(private supabaseService: SupabaseService) {}

  // 활성 대화방 목록 조회
  async getRooms() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('rooms')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  }

  // 대화방 입장
  async joinRoom(userId: string, roomId: string) {
    const client = this.supabaseService.getClient();

    // 1. 대화방 정보 조회
    const { data: room, error: roomError } = await client
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      throw new BadRequestException('존재하지 않는 대화방입니다');
    }

    if (!room.is_active) {
      throw new BadRequestException('비활성화된 대화방입니다');
    }

    // 2. 최대 인원 체크
    if (room.current_participants >= room.max_participants) {
      throw new BadRequestException('대화방이 가득 찼습니다');
    }

    // 3. 이미 다른 방에 있으면 먼저 퇴장
    await this.leaveAllRooms(userId);

    // 4. 참가자 추가
    const { error: joinError } = await client
      .from('room_participants')
      .insert({ room_id: roomId, user_id: userId });

    if (joinError) {
      // 이미 참여 중 (UNIQUE 위반)
      if (joinError.code === '23505') {
        throw new BadRequestException('이미 참여 중인 대화방입니다');
      }
      throw joinError;
    }

    // 5. current_participants +1
    await client
      .from('rooms')
      .update({ current_participants: room.current_participants + 1 })
      .eq('id', roomId);

    return { success: true, roomId };
  }

  // 대화방 퇴장
  async leaveRoom(userId: string, roomId: string) {
    const client = this.supabaseService.getClient();

    // 참가자 삭제
    const { data, error } = await client
      .from('room_participants')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new BadRequestException('참여 중이 아닌 대화방입니다');
    }

    // current_participants -1
    const { data: room } = await client
      .from('rooms')
      .select('current_participants')
      .eq('id', roomId)
      .single();

    if (room) {
      await client
        .from('rooms')
        .update({
          current_participants: Math.max(0, room.current_participants - 1),
        })
        .eq('id', roomId);
    }

    return { success: true };
  }

  // 현재 참여 중인 모든 방에서 퇴장 (disconnect 시에도 호출)
  async leaveAllRooms(userId: string): Promise<string[]> {
    const client = this.supabaseService.getClient();

    // 현재 참여 중인 방 조회
    const { data: participations } = await client
      .from('room_participants')
      .select('room_id')
      .eq('user_id', userId);

    if (!participations || participations.length === 0) return [];

    const leftRoomIds: string[] = [];
    for (const p of participations) {
      try {
        await this.leaveRoom(userId, p.room_id);
        leftRoomIds.push(p.room_id);
      } catch {
        // 이미 퇴장된 경우 무시
      }
    }
    return leftRoomIds;
  }
}
