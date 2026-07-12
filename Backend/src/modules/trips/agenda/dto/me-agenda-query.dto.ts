import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsIn,
  IsOptional,
} from 'class-validator';
import { type BookingStatus } from '../../trips.types';

const AGENDA_BOOKING_STATUSES = [
  'pending',
  'accepted',
] as const satisfies readonly BookingStatus[];

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

export class MeAgendaQueryDto {
  @ApiPropertyOptional({
    description:
      'Inclusive lower bound on scheduledDeparture. Defaults to now.',
    example: '2026-04-27T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description:
      'Exclusive upper bound on scheduledDeparture. Defaults to now + 30 days.',
    example: '2026-05-27T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({
    description:
      'Filters passenger rows by booking status. Allowed values: PENDING, ACCEPTED. Case-insensitive. Default: pending,accepted. Driver rows are unaffected.',
    example: 'PENDING,ACCEPTED',
  })
  @IsOptional()
  @Transform(({ value }) => parseStatusList(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(AGENDA_BOOKING_STATUSES, { each: true })
  bookingStatus?: BookingStatus[];
}
