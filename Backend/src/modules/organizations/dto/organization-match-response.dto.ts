import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationResponseDto } from './organization-response.dto';

export class OrganizationMatchResponseDto {
  @ApiProperty({ example: true })
  matched!: boolean;

  @ApiPropertyOptional({ type: OrganizationResponseDto, nullable: true })
  organization!: OrganizationResponseDto | null;

  @ApiPropertyOptional({
    example: 'No supported organization was found for this email domain.',
  })
  message?: string;
}
