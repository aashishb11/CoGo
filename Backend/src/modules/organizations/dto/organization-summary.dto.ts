import { ApiProperty } from '@nestjs/swagger';

// Minimal embedded shape for cross-module references (profile responses,
// ride driver/passenger cards). Anything that needs domain or timestamps
// uses OrganizationResponseDto / OrganizationDetailDto instead.
export class OrganizationSummaryDto {
  @ApiProperty({ example: 'org_abc123' })
  id!: string;

  @ApiProperty({ example: 'Universitat Politècnica de Catalunya' })
  name!: string;
}
