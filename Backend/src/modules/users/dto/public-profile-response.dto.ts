import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationSummaryDto } from '@modules/organizations/dto/organization-summary.dto';
import { ProfileBadgeDto } from './profile-response.dto';

export class PublicProfileResponseDto {
  @ApiProperty({ example: 'usr_123' })
  userId!: string;

  @ApiProperty({ example: 'Motomami' })
  username!: string;

  @ApiPropertyOptional({ example: 'Commuting from Mataró to Barcelona' })
  bio!: string | null;

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
}
