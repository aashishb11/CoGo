import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsFQDN, IsNotEmpty, IsString } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Universitat Politècnica de Catalunya' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'estudiantat.upc.edu' })
  @IsFQDN()
  @Transform(({ value }) => (value as string).trim().toLowerCase())
  domain!: string;
}
