import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateCarDto {
  @ApiProperty({ example: 'model_uuid' })
  @IsString()
  @IsNotEmpty()
  modelId!: string;

  @ApiProperty({ example: '1234ABC' })
  @IsString()
  @IsNotEmpty()
  plate!: string;

  @ApiPropertyOptional({ example: 'Red' })
  @IsOptional()
  @IsString()
  color?: string | null;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(9)
  passengerSeats!: number;
}
