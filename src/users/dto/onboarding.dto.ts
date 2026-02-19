// 온보딩 요청 DTO (닉네임 2자 이상, 관심사 3개 이상)
import { IsString, IsArray, MinLength, ArrayMinSize } from 'class-validator';

export class OnboardingDto {
  @IsString()
  @MinLength(2)
  nickname: string;

  @IsArray()
  @ArrayMinSize(3)
  @IsString({ each: true })
  interests: string[];
}
