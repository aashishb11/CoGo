import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { BOOKING_STATUSES, type BookingStatus } from '../../trips.types';

const STATUS_TOKENS = BOOKING_STATUSES.map((s) => s.toLowerCase());

const parseStatusList = (value: unknown): BookingStatus[] | undefined => {
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
  return tokens as BookingStatus[];
};

export class MeBookingsQueryDto {
  @ApiPropertyOptional({
    description:
      'Limit the result to a single trip (matches the parent ride.tripId).',
    example: 'trip_1',
  })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated list of booking statuses to include. Allowed values: PENDING, ACCEPTED, REJECTED, CANCELLED, EXPIRED. Case-insensitive.',
    example: 'PENDING,ACCEPTED',
  })
  @IsOptional()
  @Transform(({ value }) => parseStatusList(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(STATUS_TOKENS, { each: true })
  status?: BookingStatus[];

  @ApiPropertyOptional({
    description: 'Inclusive lower bound on the parent ride scheduledDeparture.',
    example: '2026-04-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'Exclusive upper bound on the parent ride scheduledDeparture.',
    example: '2026-05-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

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
