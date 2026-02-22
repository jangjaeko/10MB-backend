// 커뮤니티 게시판 컨트롤러 (게시글 CRUD, 댓글, 좋아요)
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommunityService } from './community.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/posts')
@UseGuards(AuthGuard)
export class CommunityController {
  constructor(private communityService: CommunityService) {}

  // 게시글 목록 조회
  @Get()
  async getPosts(
    @Query('category') category?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.communityService.getPosts({
      category,
      cursor,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  // 게시글 상세 조회
  @Get(':id')
  async getPost(@Param('id') id: string, @Req() req: any) {
    return this.communityService.getPost(id, req.user?.userId);
  }

  // 게시글 작성
  @Post()
  async createPost(
    @Req() req: any,
    @Body() body: { category: string; title: string; content: string },
  ) {
    return this.communityService.createPost(req.user.userId, body);
  }

  // 게시글 수정 (본인만)
  @Patch(':id')
  async updatePost(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { title?: string; content?: string },
  ) {
    return this.communityService.updatePost(req.user.userId, id, body);
  }

  // 게시글 삭제 (본인만)
  @Delete(':id')
  async deletePost(@Req() req: any, @Param('id') id: string) {
    return this.communityService.deletePost(req.user.userId, id);
  }

  // 댓글 작성
  @Post(':id/comments')
  async createComment(
    @Req() req: any,
    @Param('id') postId: string,
    @Body() body: { content: string },
  ) {
    return this.communityService.createComment(req.user.userId, postId, body.content);
  }

  // 댓글 삭제 (본인만)
  @Delete(':postId/comments/:commentId')
  async deleteComment(@Req() req: any, @Param('commentId') commentId: string) {
    return this.communityService.deleteComment(req.user.userId, commentId);
  }

  // 좋아요 토글
  @Post(':id/like')
  async toggleLike(@Req() req: any, @Param('id') postId: string) {
    return this.communityService.toggleLike(req.user.userId, postId);
  }
}
