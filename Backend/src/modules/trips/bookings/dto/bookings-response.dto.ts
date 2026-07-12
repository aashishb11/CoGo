import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BOOKING_SKIP_REASONS,
  type BookingSkipReason,
} from '@shared/errors/error-codes';
import {
  BOOKING_STATUSES,
  TRIP_TYPES,
  type BookingStatus,
} from '../../trips.types';

export class BookingResponseDto {
  @ApiProperty({ example: 'bk_1' })
  id!: string;

  @ApiProperty({ example: 'usr_passenger' })
  passengerId!: string;

  @ApiProperty({ example: 'ride_1' })
  rideId!: string;

  @ApiProperty({ example: 'trip_1' })
  tripId!: string;

  @ApiProperty({ enum: BOOKING_STATUSES, example: 'pending' })
  status!: BookingStatus;

  @ApiPropertyOptional({
    description: 'Free-form note from the passenger to the driver.',
    example: 'Can be at pickup 5 minutes earlier.',
    nullable: true,
  })
  message!: string | null;

  @ApiProperty({ example: '2026-04-26T08:30:00.000Z' })
  requestedAt!: Date;

  @ApiPropertyOptional({ example: '2026-04-26T09:00:00.000Z', nullable: true })
  acceptedAt!: Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  rejectedAt!: Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({
    description:
      'Set when the passenger has been scanned/boarded for this ride. Authoritative boarding signal — `status` does not change at boarding.',
    example: '2026-05-02T08:32:00.000Z',
    nullable: true,
  })
  boardedAt!: Date | null;

  @ApiPropertyOptional({
    description:
      "Per-seat fare snapshotted from the parent trip's `pricePerSeatCents` at acceptance time. Null while the booking is still pending.",
    example: 450,
    nullable: true,
  })
  fareCents!: number | null;

  @ApiProperty({
    description: 'Parent ride scheduled departure, snapshotted for FE display.',
    example: '2026-05-02T08:30:00.000Z',
  })
  scheduledDeparture!: Date;
}

export class BookingListResponseDto {
  @ApiProperty({ type: () => BookingResponseDto, isArray: true })
  items!: BookingResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  total!: number;
}

export class InboxPassengerDto {
  @ApiProperty({ example: 'usr_passenger' })
  id!: string;

  @ApiProperty({ example: 'Aitana Pérez' })
  name!: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatars/aitana.png',
    nullable: true,
  })
  avatar!: string | null;
}

export class InboxTripDto {
  @ApiProperty({ example: 'Mataró' })
  originLabel!: string;

  @ApiProperty({ example: 'Barcelona' })
  destinationLabel!: string;

  @ApiProperty({ enum: TRIP_TYPES, example: 'recurring' })
  type!: (typeof TRIP_TYPES)[number];
}

export class InboxItemResponseDto {
  @ApiProperty({ example: 'trip_1' })
  tripId!: string;

  @ApiProperty({ type: () => InboxTripDto })
  trip!: InboxTripDto;

  @ApiProperty({ type: () => InboxPassengerDto })
  passenger!: InboxPassengerDto;

  @ApiProperty({
    description:
      'All non-terminal bookings in this batch (pending and accepted), ordered by ride departure ascending. Use the per-booking `status` to render day chips.',
    type: () => BookingResponseDto,
    isArray: true,
  })
  bookings!: BookingResponseDto[];

  @ApiProperty({ example: 2 })
  pendingCount!: number;

  @ApiProperty({ example: 1 })
  acceptedCount!: number;

  @ApiPropertyOptional({
    description:
      'Earliest `requestedAt` among the pending bookings — drives the inbox sort order. Null when the batch has no pending bookings.',
    example: '2026-04-26T08:30:00.000Z',
    nullable: true,
  })
  oldestPendingAt!: Date | null;
}

export class InboxResponseDto {
  @ApiProperty({ type: () => InboxItemResponseDto, isArray: true })
  items!: InboxItemResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({
    description: 'Total number of (trip, passenger) batches in scope.',
    example: 7,
  })
  total!: number;
}

export class BookingsBatchCreatedResponseDto {
  @ApiProperty({ type: () => BookingResponseDto, isArray: true })
  items!: BookingResponseDto[];
}

export class BookingSkipDto {
  @ApiProperty({ example: 'bk_1' })
  id!: string;

  @ApiProperty({ enum: BOOKING_SKIP_REASONS, example: 'RIDE_FULL' })
  reason!: BookingSkipReason;
}

export class BookingsBatchOutcomeDto {
  @ApiProperty({
    description: 'IDs of bookings whose target state was applied.',
    type: [String],
    example: ['bk_1'],
  })
  accepted!: string[];

  @ApiProperty({
    description:
      'Bookings the operation could not apply to, each annotated with a stable reason code.',
    type: () => BookingSkipDto,
    isArray: true,
  })
  skipped!: BookingSkipDto[];
}
