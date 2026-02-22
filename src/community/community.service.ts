// 커뮤니티 게시판 서비스 (게시글 CRUD, 댓글, 좋아요)
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

// 카테고리 유효성 검증용
const VALID_CATEGORIES = ['free', 'concern', 'humor', 'topic', 'review'];

@Injectable()
export class CommunityService {
  constructor(private supabaseService: SupabaseService) {}

  // 게시글 목록 조회 (커서 기반 페이지네이션)
  async getPosts(options: {
    category?: string;
    cursor?: string;
    limit?: number;
  }) {
    const client = this.supabaseService.getClient();
    const limit = Math.min(options.limit || 20, 50);

    let query = client
      .from('posts')
      .select('id, user_id, category, title, content, like_count, comment_count, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    // 카테고리 필터
    if (options.category && VALID_CATEGORIES.includes(options.category)) {
      query = query.eq('category', options.category);
    }

    // 커서 (이전 페이지 마지막 게시글의 created_at)
    if (options.cursor) {
      query = query.lt('created_at', options.cursor);
    }

    const { data, error } = await query;
    if (error) throw error;

    const posts = data || [];
    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();

    // 작성자 닉네임 일괄 조회
    const userIds = [...new Set(posts.map((p: any) => p.user_id))];
    const userMap = await this.getUserNicknameMap(userIds);

    const result = posts.map((p: any) => ({
      ...p,
      authorNickname: userMap.get(p.user_id) ?? '알 수 없음',
    }));

    return {
      posts: result,
      nextCursor: hasMore ? posts[posts.length - 1].created_at : null,
      hasMore,
    };
  }

  // 게시글 상세 조회 (댓글 포함)
  async getPost(postId: string, userId?: string) {
    const client = this.supabaseService.getClient();

    // 게시글 조회
    const { data: post, error } = await client
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (error || !post) {
      throw new NotFoundException('존재하지 않는 게시글입니다');
    }

    // 작성자 닉네임
    const userMap = await this.getUserNicknameMap([post.user_id]);

    // 댓글 조회
    const { data: comments } = await client
      .from('comments')
      .select('id, user_id, content, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    // 댓글 작성자 닉네임 일괄 조회
    const commentUserIds = [...new Set((comments || []).map((c: any) => c.user_id))];
    const commentUserMap = await this.getUserNicknameMap(commentUserIds);

    // 현재 유저의 좋아요 여부
    let isLiked = false;
    if (userId) {
      const { data: like } = await client
        .from('post_likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();
      isLiked = !!like;
    }

    return {
      ...post,
      authorNickname: userMap.get(post.user_id) ?? '알 수 없음',
      isLiked,
      comments: (comments || []).map((c: any) => ({
        ...c,
        authorNickname: commentUserMap.get(c.user_id) ?? '알 수 없음',
      })),
    };
  }

  // 게시글 작성
  async createPost(userId: string, data: { category: string; title: string; content: string }) {
    if (!VALID_CATEGORIES.includes(data.category)) {
      throw new BadRequestException('유효하지 않은 카테고리입니다');
    }
    if (!data.title?.trim()) {
      throw new BadRequestException('제목을 입력해주세요');
    }
    if (!data.content?.trim()) {
      throw new BadRequestException('내용을 입력해주세요');
    }

    const client = this.supabaseService.getClient();

    const { data: post, error } = await client
      .from('posts')
      .insert({
        user_id: userId,
        category: data.category,
        title: data.title.trim(),
        content: data.content.trim(),
      })
      .select()
      .single();

    if (error) throw error;
    return post;
  }

  // 게시글 수정 (본인만)
  async updatePost(userId: string, postId: string, data: { title?: string; content?: string }) {
    const client = this.supabaseService.getClient();

    // 게시글 소유자 확인
    const { data: post, error: findError } = await client
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .single();

    if (findError || !post) {
      throw new NotFoundException('존재하지 않는 게시글입니다');
    }
    if (post.user_id !== userId) {
      throw new ForbiddenException('본인의 게시글만 수정할 수 있습니다');
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (data.title?.trim()) updateData.title = data.title.trim();
    if (data.content?.trim()) updateData.content = data.content.trim();

    const { data: updated, error } = await client
      .from('posts')
      .update(updateData)
      .eq('id', postId)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  // 게시글 삭제 (본인만)
  async deletePost(userId: string, postId: string) {
    const client = this.supabaseService.getClient();

    // 게시글 소유자 확인
    const { data: post, error: findError } = await client
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .single();

    if (findError || !post) {
      throw new NotFoundException('존재하지 않는 게시글입니다');
    }
    if (post.user_id !== userId) {
      throw new ForbiddenException('본인의 게시글만 삭제할 수 있습니다');
    }

    const { error } = await client
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) throw error;
    return { success: true };
  }

  // 댓글 작성
  async createComment(userId: string, postId: string, content: string) {
    if (!content?.trim()) {
      throw new BadRequestException('댓글 내용을 입력해주세요');
    }

    const client = this.supabaseService.getClient();

    // 게시글 존재 확인
    const { data: post, error: postError } = await client
      .from('posts')
      .select('id')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      throw new NotFoundException('존재하지 않는 게시글입니다');
    }

    // 댓글 삽입
    const { data: comment, error } = await client
      .from('comments')
      .insert({
        post_id: postId,
        user_id: userId,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) throw error;

    // comment_count +1
    await client
      .from('posts')
      .update({ comment_count: (await this.getCommentCount(postId)) })
      .eq('id', postId);

    return comment;
  }

  // 댓글 삭제 (본인만)
  async deleteComment(userId: string, commentId: string) {
    const client = this.supabaseService.getClient();

    const { data: comment, error: findError } = await client
      .from('comments')
      .select('user_id, post_id')
      .eq('id', commentId)
      .single();

    if (findError || !comment) {
      throw new NotFoundException('존재하지 않는 댓글입니다');
    }
    if (comment.user_id !== userId) {
      throw new ForbiddenException('본인의 댓글만 삭제할 수 있습니다');
    }

    const { error } = await client
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (error) throw error;

    // comment_count 갱신
    await client
      .from('posts')
      .update({ comment_count: (await this.getCommentCount(comment.post_id)) })
      .eq('id', comment.post_id);

    return { success: true };
  }

  // 좋아요 토글
  async toggleLike(userId: string, postId: string) {
    const client = this.supabaseService.getClient();

    // 게시글 존재 확인
    const { data: post, error: postError } = await client
      .from('posts')
      .select('id')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      throw new NotFoundException('존재하지 않는 게시글입니다');
    }

    // 기존 좋아요 확인
    const { data: existing } = await client
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      // 좋아요 취소
      await client.from('post_likes').delete().eq('id', existing.id);
    } else {
      // 좋아요 추가
      await client.from('post_likes').insert({ post_id: postId, user_id: userId });
    }

    // like_count 갱신
    const { count } = await client
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    await client
      .from('posts')
      .update({ like_count: count ?? 0 })
      .eq('id', postId);

    return { liked: !existing, likeCount: count ?? 0 };
  }

  // 유저 닉네임 맵 조회 (일괄)
  private async getUserNicknameMap(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();

    const { data: users } = await this.supabaseService
      .getClient()
      .from('users')
      .select('id, nickname')
      .in('id', userIds);

    return new Map((users ?? []).map((u: any) => [u.id, u.nickname]));
  }

  // 댓글 수 조회
  private async getCommentCount(postId: string): Promise<number> {
    const { count } = await this.supabaseService
      .getClient()
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    return count ?? 0;
  }
}
