import { ApiProperty } from '@nestjs/swagger';

export class OrganizationResponseDto {
  @ApiProperty({ example: 'org_abc123' })
  id!: string;

  @ApiProperty({ example: 'Universitat Politècnica de Catalunya' })
  name!: string;

  @ApiProperty({ example: 'estudiantat.upc.edu' })
  domain!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
