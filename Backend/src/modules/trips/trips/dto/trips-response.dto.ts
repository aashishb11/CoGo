import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationSummaryDto } from '@modules/organizations/dto/organization-summary.dto';
import { ExternalEventContextDto } from './create-trip.dto';
import {
  CONVERSATION_STYLES,
  MUSIC_GENRES,
  TRIP_STATUSES,
  TRIP_TYPES,
} from '../../trips.types';
import type { DaysOfWeek } from '../../trips.types';

export class LocationResponseDto {
  @ApiProperty({ example: 'Mataró' })
  label!: string;

  @ApiProperty({ example: 41.5381 })
  lat!: number;

  @ApiProperty({ example: 2.4445 })
  lng!: number;
}

export class DriverSummaryDto {
  @ApiProperty({ example: 'usr_123' })
  userId!: string;

  @ApiProperty({ example: 'Aitana Pérez' })
  fullName!: string;

  @ApiPropertyOptional({
    type: OrganizationSummaryDto,
    nullable: true,
    description:
      "Organization the driver is linked to (if any). Use to render trust signals like 'Maria from UPC' on ride cards.",
  })
  organization!: OrganizationSummaryDto | null;

  @ApiPropertyOptional({ example: 24, nullable: true })
  age!: number | null;

  @ApiPropertyOptional({
    enum: CONVERSATION_STYLES,
    example: 'casual',
    nullable: true,
  })
  conversationStyle!: (typeof CONVERSATION_STYLES)[number] | null;

  @ApiProperty({ example: false })
  smokeAllowed!: boolean;

  @ApiProperty({ example: true })
  musicAllowed!: boolean;

  @ApiPropertyOptional({
    enum: MUSIC_GENRES,
    example: 'indie',
    nullable: true,
  })
  musicGenre!: (typeof MUSIC_GENRES)[number] | null;
}

export class RecurringScheduleResponseDto {
  @ApiProperty({
    example: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
    },
  })
  daysOfWeek!: DaysOfWeek;

  @ApiProperty({ example: '08:30' })
  timeOfDay!: string;
}

export class TripResponseDto {
  @ApiProperty({ example: 'trip_1' })
  id!: string;

  @ApiProperty({ example: 'usr_123' })
  driverId!: string;

  @ApiProperty({ type: () => DriverSummaryDto })
  driver!: DriverSummaryDto;

  @ApiProperty({ enum: TRIP_TYPES, example: 'sporadic' })
  type!: (typeof TRIP_TYPES)[number];

  @ApiProperty({ type: () => LocationResponseDto })
  origin!: LocationResponseDto;

  @ApiProperty({ type: () => LocationResponseDto })
  destination!: LocationResponseDto;

  @ApiPropertyOptional({
    example: '2026-03-28T08:30:00.000Z',
    nullable: true,
  })
  departureAt!: Date | null;

  @ApiPropertyOptional({
    type: () => RecurringScheduleResponseDto,
    nullable: true,
  })
  schedule!: RecurringScheduleResponseDto | null;

  @ApiProperty({ example: 3 })
  seatsOffered!: number;

  @ApiProperty({
    example: 500,
    description:
      'Per-seat fare in EUR cents set by the driver. Frozen onto each accepted booking as `fareCents`.',
  })
  pricePerSeatCents!: number;

  @ApiProperty({ enum: TRIP_STATUSES, example: 'active' })
  status!: (typeof TRIP_STATUSES)[number];

  @ApiPropertyOptional({
    description:
      'Total driving distance in kilometres, computed at trip creation. Falls back to great-circle distance if route calculation is unavailable.',
    example: 34.52,
    nullable: true,
  })
  totalDistanceKm!: number | null;

  @ApiPropertyOptional({
    description:
      'Estimated driving duration in minutes, from the routing service (0 if great-circle fallback was used).',
    example: 28,
    nullable: true,
  })
  estimatedDurationMinutes!: number | null;

  @ApiPropertyOptional({
    description:
      'Estimated CO2 saved per passenger seat in kilograms — what one passenger avoids by joining the trip instead of driving alone. Server-derived from totalDistanceKm × car model emission rate. Null if either input is missing.',
    example: 1.78,
    nullable: true,
  })
  estimatedCo2SavingsPerSeatKg!: number | null;

  @ApiPropertyOptional({
    description:
      'Encoded polyline string representing the driving route (Google Polyline format).',
    example: 'a~l~Fjk~uOwHJy@P',
    nullable: true,
  })
  routePolyline!: string | null;

  @ApiPropertyOptional({
    description: 'Set when the trip transitioned to CANCELLED.',
    example: '2026-04-01T08:00:00.000Z',
    nullable: true,
  })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({
    description: 'Free-form reason captured when the trip was cancelled.',
    example: 'Car broke down',
    nullable: true,
  })
  cancellationReason!: string | null;

  @ApiPropertyOptional({
    description:
      'Set when the trip transitioned to ARCHIVED (no future ACTIVE rides remain).',
    example: '2026-04-30T22:00:00.000Z',
    nullable: true,
  })
  archivedAt!: Date | null;

  @ApiPropertyOptional({
    type: () => ExternalEventContextDto,
    nullable: true,
    description:
      'External event reference persisted when the trip was created from a CultuCat event.',
  })
  externalEventContext!: ExternalEventContextDto | null;
}

export class TripDetailResponseDto extends TripResponseDto {
  @ApiProperty({ example: 'car_1' })
  carId!: string;
}

export class TripListResponseDto {
  @ApiProperty({ type: () => TripResponseDto, isArray: true })
  items!: TripResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 2 })
  total!: number;
}
