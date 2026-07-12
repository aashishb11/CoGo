import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  RATING_COMMENT_MAX_LENGTH,
  RATING_SCORE_MAX,
  RATING_SCORE_MIN,
} from '../ratings.types';

export class CreateRatingDto {
  @ApiProperty({
    description: 'The user being rated (driver or boarded passenger).',
    example: 'user_01HXYZ…',
  })
  @IsString()
  rateeUserId!: string;

  @ApiProperty({
    description: `Integer score between ${RATING_SCORE_MIN} and ${RATING_SCORE_MAX}.`,
    minimum: RATING_SCORE_MIN,
    maximum: RATING_SCORE_MAX,
    example: 5,
  })
  @IsInt()
  @Min(RATING_SCORE_MIN)
  @Max(RATING_SCORE_MAX)
  score!: number;

  @ApiPropertyOptional({
    description: 'Optional free-text comment. Visible to admins only.',
    maxLength: RATING_COMMENT_MAX_LENGTH,
    example: 'Great driver, very punctual.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(RATING_COMMENT_MAX_LENGTH)
  comment?: string;
}
