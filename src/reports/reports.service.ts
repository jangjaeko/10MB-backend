// 사용자 신고 서비스 (신고 접수 및 DB 저장)
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(private supabaseService: SupabaseService) {}

  async createReport(reporterId: string, dto: CreateReportDto) {
    const report = await this.supabaseService.createReport({
      reporter_id: reporterId,
      reported_id: dto.reportedId,
      session_id: dto.sessionId,
      reason: dto.reason,
      description: dto.description,
    });

    return {
      success: true,
      reportId: report.id,
    };
  }
}
