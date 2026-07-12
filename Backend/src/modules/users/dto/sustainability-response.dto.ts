import { ApiProperty } from '@nestjs/swagger';

export class SustainabilityMetricsDto {
  @ApiProperty({
    description: 'Total CO2 saved across all rides (kg)',
    example: 48.75,
  })
  totalCo2SavedKg!: number;

  @ApiProperty({
    description:
      'Equivalent number of trees needed to absorb the saved CO2 over one year (IPCC 22 kg/tree/year)',
    example: 2.22,
  })
  equivalentTreesPerYear!: number;

  @ApiProperty({
    description: 'Equivalent litres of gasoline not burned (2.31 kg CO2/litre)',
    example: 21.1,
  })
  equivalentFuelLitresSaved!: number;
}

export class SustainabilityResponseDto {
  @ApiProperty({ example: 'usr_123' })
  userId!: string;

  @ApiProperty({ example: 320 })
  totalXp!: number;

  @ApiProperty({
    example: 80,
    description: 'XP points required to reach the next level.',
  })
  xpToNextLevel!: number;

  @ApiProperty({
    example: 1,
    description:
      'Computed level = floor(sqrt(xpPoints / 100)). Level 1 = 100 XP, level 2 = 400 XP, …',
  })
  level!: number;

  @ApiProperty({ type: SustainabilityMetricsDto })
  metrics!: SustainabilityMetricsDto;
}
