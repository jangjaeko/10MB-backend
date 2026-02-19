import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateReportDto } from './dto/create-report.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @UseGuards(AuthGuard)
  async createReport(@Request() req: any, @Body() dto: CreateReportDto) {
    return this.reportsService.createReport(req.user.userId, dto);
  }
}
