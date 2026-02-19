import { IsArray, IsString } from 'class-validator';

export class StartMatchDto {
  @IsArray()
  @IsString({ each: true })
  interests: string[];
}
