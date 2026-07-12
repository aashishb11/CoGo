import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RatingSummaryResponseDto {
  @ApiPropertyOptional({
    description:
      'Average score across all ratings received, rounded to 2 decimals. `null` when `count === 0` so the FE can render "no ratings yet" without a special case.',
    example: 4.5,
    nullable: true,
    minimum: 1,
    maximum: 5,
  })
  averageScore!: number | null;

  @ApiProperty({
    description: 'Total number of ratings received.',
    example: 12,
  })
  count!: number;
}
