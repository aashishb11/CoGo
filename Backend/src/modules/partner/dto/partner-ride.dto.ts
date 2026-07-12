import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RIDE_STATUSES } from '@modules/trips/trips.types';

// Public partner-API contract. Deliberately decoupled from the internal ride
// DTOs (RideSearchItemDto / RideDetailResponseDto) so internal changes can't
// silently break external consumers. See docs/plans/2026-05-21-partner-rides-api.md.

export class PartnerLocationDto {
  @ApiProperty({ example: 'Mataró' })
  label!: string;

  @ApiProperty({ example: 41.5381 })
  lat!: number;

  @ApiProperty({ example: 2.4445 })
  lng!: number;
}

export class PartnerRideDto {
  @ApiProperty({ example: 'ride_1' })
  id!: string;

  @ApiProperty({
    description: 'Scheduled departure, UTC ISO-8601.',
    example: '2026-05-02T08:30:00.000Z',
  })
  departureTime!: Date;

  @ApiProperty({ enum: RIDE_STATUSES, example: 'active' })
  status!: (typeof RIDE_STATUSES)[number];

  @ApiProperty({ type: () => PartnerLocationDto })
  origin!: PartnerLocationDto;

  @ApiProperty({ type: () => PartnerLocationDto })
  destination!: PartnerLocationDto;

  @ApiProperty({ example: 34.52 })
  totalDistanceKm!: number;

  @ApiProperty({
    description: 'Free seats still bookable (seatsOffered - seatsOccupied).',
    example: 2,
  })
  availableSeats!: number;

  @ApiProperty({ example: 'Aitana Pérez' })
  driverName!: string;

  @ApiPropertyOptional({
    description: 'Name of the organization the driver is linked to, if any.',
    example: 'Universitat Politècnica de Catalunya',
    nullable: true,
  })
  driverOrganization!: string | null;

  @ApiProperty({ example: false })
  smokeAllowed!: boolean;

  @ApiProperty({ example: true })
  musicAllowed!: boolean;

  @ApiPropertyOptional({
    description:
      'Driving route geometry as a Google-style encoded polyline (precision 5). Compact wire format; decoders are available in most map libraries (Google Maps decodes natively; for Leaflet see @mapbox/polyline). Null when no route was computed for the trip.',
    example: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
    nullable: true,
  })
  routePolyline!: string | null;

  @ApiPropertyOptional({
    description:
      'Driving route geometry as an array of [lat, lng] coordinate pairs decoded from routePolyline. Heavier than the polyline but renders directly without a decoder dependency. Null when no route was computed.',
    example: [
      [41.5381, 2.4445],
      [41.4623, 2.3134],
      [41.3851, 2.1734],
    ],
    nullable: true,
    isArray: true,
  })
  routeCoordinates!: [number, number][] | null;
}

export class PartnerRideSearchResponseDto {
  @ApiProperty({ type: () => PartnerRideDto, isArray: true })
  items!: PartnerRideDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  total!: number;
}
