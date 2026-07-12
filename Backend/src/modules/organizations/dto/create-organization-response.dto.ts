import { ApiProperty } from '@nestjs/swagger';
import { OrganizationResponseDto } from './organization-response.dto';

export class CreateOrganizationResponseDto {
  @ApiProperty({ type: OrganizationResponseDto })
  organization!: OrganizationResponseDto;

  @ApiProperty({
    description: 'Number of existing unlinked users auto-linked on creation',
    example: 3,
  })
  linkedCount!: number;
}
