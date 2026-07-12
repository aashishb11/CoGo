import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateProfileDto {
  @ApiProperty({ example: 'Motomami' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiPropertyOptional({ example: 'Commuting from Mataró to Barcelona' })
  @IsOptional()
  @IsString()
  bio?: string | null;

  @ApiPropertyOptional({ example: '+34600000000' })
  @IsOptional()
  @IsString()
  phone?: string | null;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  locale?: string | null;
}
