import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateCarDto {
  @ApiPropertyOptional({ example: 'model_uuid' })
  @IsOptional()
  @IsString()
  modelId?: string;

  @ApiPropertyOptional({ example: '1234ABC' })
  @IsOptional()
  @IsString()
  plate?: string;

  @ApiPropertyOptional({ example: 'Red' })
  @IsOptional()
  @IsString()
  color?: string | null;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  passengerSeats?: number;
}
