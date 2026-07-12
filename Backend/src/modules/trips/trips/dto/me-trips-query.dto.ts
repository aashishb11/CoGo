import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { TRIP_STATUSES, type TripStatus } from '../../trips.types';

const STATUS_TOKENS = TRIP_STATUSES.map((s) => s.toLowerCase());

const parseStatusList = (value: unknown): TripStatus[] | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const raw = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string').join(',')
    : typeof value === 'string'
      ? value
      : '';
  const tokens = raw
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  return tokens as TripStatus[];
};

export class MeTripsQueryDto {
  @ApiPropertyOptional({
    description:
      'Comma-separated list of trip statuses to include. Allowed values: ACTIVE, CANCELLED, ARCHIVED. Case-insensitive. Default: ACTIVE,CANCELLED.',
    example: 'ACTIVE,CANCELLED',
  })
  @IsOptional()
  @Transform(({ value }) => parseStatusList(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(STATUS_TOKENS, { each: true })
  status?: TripStatus[];

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
