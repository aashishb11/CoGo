import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LeaderboardEntryDto {
  @ApiProperty({ example: 1, description: 'Rank position (1-based).' })
  rank!: number;

  @ApiProperty({ example: 'usr_123' })
  userId!: string;

  @ApiProperty({ example: 'Motomami' })
  username!: string;

  @ApiProperty({ example: 1250 })
  xpPoints!: number;

  @ApiProperty({
    example: 3,
    description: 'Computed: floor(sqrt(xpPoints / 100))',
  })
  level!: number;

  @ApiProperty({ example: 48.75, description: 'Total CO2 saved (kg).' })
  totalCo2Saved!: number;

  @ApiProperty({
    example: 11,
    description: 'Total rides completed (driver + passenger).',
  })
  ridesCompleted!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Organization the user belongs to, if any.',
    example: { id: 'org_abc123', name: 'Universitat Politècnica de Catalunya' },
  })
  organization!: { id: string; name: string } | null;
}

export class LeaderboardResponseDto {
  @ApiProperty({ type: [LeaderboardEntryDto] })
  items!: LeaderboardEntryDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 150, description: 'Total number of ranked users.' })
  total!: number;
}
