import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  LEADERBOARD_SORT_BY,
  type LeaderboardSortBy,
} from '../leaderboard.types';

export class LeaderboardQueryDto {
  @ApiPropertyOptional({
    enum: LEADERBOARD_SORT_BY,
    default: 'xp_points',
    description: 'Field to rank users by.',
  })
  @IsOptional()
  @IsEnum(LEADERBOARD_SORT_BY)
  sortBy?: LeaderboardSortBy = 'xp_points';

  @ApiPropertyOptional({
    description: 'Filter to a specific organization. Returns only members.',
    example: 'org_abc123',
  })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({
    description: 'Page number (1-based).',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 100).',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Transform(({ value }: { value: number }) => Math.min(value, 100))
  limit?: number = 20;
}
