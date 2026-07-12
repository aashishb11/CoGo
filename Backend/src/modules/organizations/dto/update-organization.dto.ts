import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsFQDN, IsOptional, IsString } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiProperty({
    example: 'Universitat Politècnica de Catalunya',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'estudiantat.upc.edu', required: false })
  @IsOptional()
  @IsFQDN()
  @Transform(({ value }) => (value as string).trim().toLowerCase())
  domain?: string;
}
