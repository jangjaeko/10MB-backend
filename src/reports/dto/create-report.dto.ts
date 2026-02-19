import { IsString, IsOptional, IsIn, IsUUID } from 'class-validator';

export class CreateReportDto {
  @IsUUID()
  reportedId: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsString()
  @IsIn(['harassment', 'spam', 'inappropriate', 'other'])
  reason: string;

  @IsOptional()
  @IsString()
  description?: string;
}
