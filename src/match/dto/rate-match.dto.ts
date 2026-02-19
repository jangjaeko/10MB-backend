import { IsString, IsIn } from 'class-validator';

export class RateMatchDto {
  @IsString()
  @IsIn(['good', 'neutral'])
  rating: 'good' | 'neutral';
}
