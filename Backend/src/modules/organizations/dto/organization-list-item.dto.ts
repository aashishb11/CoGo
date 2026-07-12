import { ApiProperty } from '@nestjs/swagger';

export class OrganizationListItemDto {
  @ApiProperty({ example: 'org_abc123' })
  id!: string;

  @ApiProperty({ example: 'Universitat Politècnica de Catalunya' })
  name!: string;

  @ApiProperty({ example: 'estudiantat.upc.edu' })
  domain!: string;

  @ApiProperty({ example: 42 })
  memberCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
