// 서버용 Supabase 클라이언트 서비스 (service_role key 사용)
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase credentials not configured');
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  // User operations
  async getUserById(id: string) {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  // 이메일로 사용자 조회
  async getUserByEmail(email: string) {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  // 닉네임 중복 여부 확인 (excludeUserId: 본인 제외)
  async isNicknameTaken(nickname: string, excludeUserId?: string): Promise<boolean> {
    let query = this.supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('nickname', nickname);

    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { count, error } = await query;
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async createUser(userData: {
    id: string;
    email: string;
    nickname?: string;
    interests?: string[];
  }) {
    const { data, error } = await this.supabase
      .from('users')
      .insert(userData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateUser(
    id: string,
    userData: Partial<{
      nickname: string;
      interests: string[];
      is_online: boolean;
      total_calls: number;
      total_minutes: number;
    }>,
  ) {
    const { data, error } = await this.supabase
      .from('users')
      .update({ ...userData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Match session operations

  // 세션 조회
  async getMatchSession(id: string) {
    const { data, error } = await this.supabase
      .from('match_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async createMatchSession(sessionData: {
    status: string;
    interests: string[];
    agora_channel_id?: string;
  }) {
    const { data, error } = await this.supabase
      .from('match_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateMatchSession(
    id: string,
    sessionData: Partial<{
      status: string;
      agora_channel_id: string;
      started_at: string;
      ends_at: string;
      actual_ended_at: string;
    }>,
  ) {
    const { data, error } = await this.supabase
      .from('match_sessions')
      .update(sessionData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Match participant operations
  async addMatchParticipant(participantData: {
    session_id: string;
    user_id: string;
  }) {
    const { data, error } = await this.supabase
      .from('match_participants')
      .insert(participantData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateMatchParticipant(
    sessionId: string,
    userId: string,
    data: Partial<{ rating: string; reported: boolean }>,
  ) {
    const { error } = await this.supabase
      .from('match_participants')
      .update(data)
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  // Report operations
  async createReport(reportData: {
    reporter_id: string;
    reported_id: string;
    session_id?: string;
    reason: string;
    description?: string;
  }) {
    const { data, error } = await this.supabase
      .from('reports')
      .insert(reportData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Online count
  async getOnlineCount(): Promise<number> {
    const { count, error } = await this.supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_online', true);

    if (error) throw error;
    return count ?? 0;
  }
}
