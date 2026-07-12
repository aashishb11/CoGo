import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Motomami' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: 'Now commuting from Badalona' })
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
