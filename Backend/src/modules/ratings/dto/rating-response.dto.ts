import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RatingResponseDto {
  @ApiProperty({ example: 'rating_01HXYZ…' })
  id!: string;

  @ApiProperty({ example: 'ride_01HXYZ…' })
  rideId!: string;

  @ApiProperty({ example: 'user_01HXYZ…' })
  raterId!: string;

  @ApiProperty({ example: 'user_02HXYZ…' })
  rateeId!: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  score!: number;

  @ApiPropertyOptional({ example: 'Great driver.', nullable: true })
  comment!: string | null;

  @ApiProperty({ example: '2026-05-25T10:00:00.000Z' })
  createdAt!: Date;
}

export class AdminRatingListResponseDto {
  @ApiProperty({ type: () => RatingResponseDto, isArray: true })
  items!: RatingResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  total!: number;
}
