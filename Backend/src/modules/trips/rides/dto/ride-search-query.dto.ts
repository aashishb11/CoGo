import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { IsYmd } from '../../trips/dto/validators/is-ymd.validator';

export class RideSearchQueryDto {
  @ApiProperty({ example: 41.5381 })
  @Type(() => Number)
  @IsLatitude()
  originLat!: number;

  @ApiProperty({ example: 2.4445 })
  @Type(() => Number)
  @IsLongitude()
  originLng!: number;

  @ApiProperty({ example: 41.3851 })
  @Type(() => Number)
  @IsLatitude()
  destinationLat!: number;

  @ApiProperty({ example: 2.1734 })
  @Type(() => Number)
  @IsLongitude()
  destinationLng!: number;

  @ApiProperty({
    description: 'Calendar date in Europe/Madrid (YYYY-MM-DD).',
    example: '2026-04-16',
  })
  @IsYmd()
  date!: string;

  @ApiProperty({
    description: 'Search radius in kilometres applied to both endpoints.',
    example: 5,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radiusKm!: number;

  @ApiPropertyOptional({
    description: 'Minimum free seats required on each ride. Defaults to 1.',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seatsNeeded: number = 1;

  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
