// 프로필 수정 요청 DTO (닉네임, 관심사 모두 선택적)
import { IsString, IsArray, IsOptional, MinLength, ArrayMinSize } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nickname?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @IsString({ each: true })
  interests?: string[];
}
