import { ApiProperty } from '@nestjs/swagger';

export class OrganizationMemberDto {
  @ApiProperty({ example: 'usr_abc123' })
  id!: string;

  @ApiProperty({ example: 'Maria Garcia' })
  name!: string;

  @ApiProperty({ example: 'maria@estudiantat.upc.edu' })
  email!: string;

  @ApiProperty({ example: 'user', nullable: true })
  role!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class OrganizationDetailDto {
  @ApiProperty({ example: 'org_abc123' })
  id!: string;

  @ApiProperty({ example: 'Universitat Politècnica de Catalunya' })
  name!: string;

  @ApiProperty({ example: 'estudiantat.upc.edu' })
  domain!: string;

  @ApiProperty({ type: [OrganizationMemberDto] })
  members!: OrganizationMemberDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
