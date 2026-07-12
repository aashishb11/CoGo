import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { RIDE_STATUSES, type RideStatus } from '../../trips.types';

const STATUS_TOKENS = RIDE_STATUSES.map((s) => s.toLowerCase());

const parseStatusList = (value: unknown): RideStatus[] | undefined => {
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
  return tokens as RideStatus[];
};

export class RideListQueryDto {
  @ApiPropertyOptional({
    description:
      'Inclusive lower bound on scheduledDeparture. Defaults to now.',
    example: '2026-04-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'Exclusive upper bound on scheduledDeparture.',
    example: '2026-05-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({
    description:
      'Comma-separated list of ride statuses to include. Allowed values: ACTIVE, COMPLETED, CANCELLED. Case-insensitive. Default: ACTIVE,COMPLETED.',
    example: 'ACTIVE,COMPLETED',
  })
  @IsOptional()
  @Transform(({ value }) => parseStatusList(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(STATUS_TOKENS, { each: true })
  status?: RideStatus[];

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
