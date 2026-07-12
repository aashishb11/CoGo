import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationSummaryDto } from '@modules/organizations/dto/organization-summary.dto';
import {
  CONVERSATION_STYLES,
  MUSIC_GENRES,
  RIDE_STATUSES,
  TRIP_TYPES,
} from '../../trips.types';
import { LocationResponseDto } from '../../trips/dto/trips-response.dto';

export class RideResponseDto {
  @ApiProperty({ example: 'ride_1' })
  id!: string;

  @ApiProperty({ example: 'trip_1' })
  tripId!: string;

  @ApiProperty({ example: '2026-05-02T08:30:00.000Z' })
  scheduledDeparture!: Date;

  @ApiProperty({ enum: RIDE_STATUSES, example: 'active' })
  status!: (typeof RIDE_STATUSES)[number];

  @ApiProperty({ type: () => LocationResponseDto })
  origin!: LocationResponseDto;

  @ApiProperty({ type: () => LocationResponseDto })
  destination!: LocationResponseDto;

  @ApiProperty({ example: 34.52 })
  totalDistanceKm!: number;

  @ApiProperty({ example: 3 })
  seatsOffered!: number;

  @ApiProperty({ example: 1 })
  seatsOccupied!: number;

  @ApiPropertyOptional({
    description:
      'Frozen value at completion: seatsOccupied * totalDistanceKm * carModel.co2KgPerKm.',
    example: 4.08,
    nullable: true,
  })
  actualCo2SavedKg!: number | null;

  @ApiPropertyOptional({ example: '2026-05-02T10:00:00.000Z', nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  cancellationReason!: string | null;
}

export class TripSummaryDto {
  @ApiProperty({ example: 'trip_1' })
  tripId!: string;

  @ApiProperty({ enum: TRIP_TYPES, example: 'sporadic' })
  tripType!: (typeof TRIP_TYPES)[number];

  @ApiProperty({ example: 'usr_driver' })
  driverId!: string;

  @ApiProperty({ example: 'Aitana Pérez' })
  driverName!: string;

  @ApiProperty({
    example: 500,
    description:
      'Per-seat fare in EUR cents (set by the driver on the parent trip). Surfaced here so passenger-facing ride detail/search renders the price without an extra trip lookup.',
  })
  pricePerSeatCents!: number;

  @ApiPropertyOptional({
    type: OrganizationSummaryDto,
    nullable: true,
    description:
      "Organization the driver is linked to (if any). Use to render trust signals like 'Maria from UPC' on ride cards.",
  })
  driverOrganization!: OrganizationSummaryDto | null;

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

  @ApiPropertyOptional({ example: 'Toyota', nullable: true })
  carModelBrand!: string | null;

  @ApiPropertyOptional({ example: 'Prius', nullable: true })
  carModelName!: string | null;

  @ApiPropertyOptional({
    description:
      'Encoded polyline (Google Polyline format, precision 5) of the driving route from origin to destination. Null when the trip was created before polylines were computed or routing failed.',
    example: 'a~lE_p`u@...',
    nullable: true,
  })
  routePolyline!: string | null;
}

export class RideDetailResponseDto extends RideResponseDto {
  @ApiProperty({ type: () => TripSummaryDto })
  trip!: TripSummaryDto;
}

export class RideSearchItemDto extends RideResponseDto {
  @ApiProperty({ type: () => TripSummaryDto })
  trip!: TripSummaryDto;
}

export class RideListResponseDto {
  @ApiProperty({ type: () => RideResponseDto, isArray: true })
  items!: RideResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  total!: number;
}

export class RideSearchResponseDto {
  @ApiProperty({ type: () => RideSearchItemDto, isArray: true })
  items!: RideSearchItemDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  total!: number;
}
