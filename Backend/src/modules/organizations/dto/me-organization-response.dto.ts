import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationResponseDto } from './organization-response.dto';

export class MeOrganizationResponseDto {
  @ApiPropertyOptional({ type: OrganizationResponseDto, nullable: true })
  organization!: OrganizationResponseDto | null;
}
