import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationSummaryDto } from '@modules/organizations/dto/organization-summary.dto';

export class ProfileBadgeDto {
  @ApiProperty({ example: 'first_ride' })
  id!: string;

  @ApiProperty({ example: '2026-05-12T21:00:00.000Z' })
  awardedAt!: string;
}

export class ProfileResponseDto {
  @ApiProperty({ example: 'usr_123' })
  userId!: string;

  @ApiProperty({ example: 'Motomami' })
  username!: string;

  @ApiPropertyOptional({ example: 'Commuting from Mataró to Barcelona' })
  bio!: string | null;

  @ApiPropertyOptional({ example: '+34600000000' })
  phone!: string | null;

  @ApiPropertyOptional({ example: 'en' })
  locale!: string | null;

  @ApiProperty({ example: 12.5 })
  totalCo2Saved!: number;

  @ApiProperty({ example: 320 })
  xpPoints!: number;

  @ApiProperty({
    example: 1,
    description: 'Computed: floor(sqrt(xpPoints / 100))',
  })
  level!: number;

  @ApiProperty({
    example: 80,
    description: 'XP points required to reach the next level.',
  })
  xpToNextLevel!: number;

  @ApiProperty({ example: 4 })
  ridesAsDriver!: number;

  @ApiProperty({ example: 7 })
  ridesAsPassenger!: number;

  @ApiProperty({ type: [ProfileBadgeDto] })
  badges!: ProfileBadgeDto[];

  @ApiPropertyOptional({ type: OrganizationSummaryDto, nullable: true })
  organization!: OrganizationSummaryDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
