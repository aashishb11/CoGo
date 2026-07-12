import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import {
  CONVERSATION_STYLES,
  MUSIC_GENRES,
  TRIP_TYPES,
  type ConversationStyle,
  type MusicGenre,
  type TripType,
} from '../../trips.types';
import { LocationResponseDto } from '../../trips/dto/trips-response.dto';

// Subset of RIDE_STATUSES that the agenda can return. Cancelled rides are
// always filtered out; completed rides are included so a `from` in the past
// or the .ics calendar feed surfaces recent history.
const AGENDA_RIDE_STATUSES = ['active', 'in_progress', 'completed'] as const;
type AgendaRideStatus = (typeof AGENDA_RIDE_STATUSES)[number];

class AgendaItemBaseDto {
  @ApiProperty({ example: 'ride_1' })
  rideId!: string;

  @ApiProperty({ example: 'trip_1' })
  tripId!: string;

  @ApiProperty({ enum: TRIP_TYPES, example: 'sporadic' })
  tripType!: TripType;

  @ApiProperty({
    description:
      'Ride lifecycle: `active` for upcoming rides, `in_progress` for rides currently underway, `completed` for finished rides (returned when the window or `from` covers the past). Cancelled rides are excluded.',
    enum: AGENDA_RIDE_STATUSES,
    example: 'active',
  })
  status!: AgendaRideStatus;

  @ApiProperty({ example: '2026-05-02T08:30:00.000Z' })
  scheduledDeparture!: Date;

  @ApiProperty({
    description:
      'Timestamp the driver actually started the ride. Null for rides still in `active` status.',
    example: '2026-05-02T08:34:12.000Z',
    nullable: true,
  })
  startedAt!: Date | null;

  @ApiProperty({
    description:
      'Timestamp the ride was completed. Null while the ride is `active` or `in_progress`.',
    example: '2026-05-02T09:05:00.000Z',
    nullable: true,
  })
  completedAt!: Date | null;

  @ApiProperty({
    description:
      'CO2 actually saved on this ride in kilograms, frozen at completion (seatsOccupied × totalDistanceKm × carModel.co2KgPerKm). Null until the ride is completed.',
    example: 4.14,
    nullable: true,
  })
  actualCo2SavedKg!: number | null;

  @ApiProperty({ type: () => LocationResponseDto })
  origin!: LocationResponseDto;

  @ApiProperty({ type: () => LocationResponseDto })
  destination!: LocationResponseDto;

  @ApiProperty({ example: 34.52 })
  totalDistanceKm!: number;

  @ApiProperty({ example: 28, nullable: true })
  estimatedDurationMinutes!: number | null;

  @ApiProperty({
    description:
      'Estimated CO2 saved per passenger seat in kilograms. Null if either totalDistanceKm or the car-model emission rate is missing.',
    example: 4.14,
    nullable: true,
  })
  estimatedCo2SavingsPerSeatKg!: number | null;

  @ApiProperty({
    description:
      'Per-seat fare in EUR cents set by the driver on the parent trip.',
    example: 500,
  })
  pricePerSeatCents!: number;
}

export class AgendaDriverItemDto extends AgendaItemBaseDto {
  @ApiProperty({ enum: ['driver'], example: 'driver' })
  role!: 'driver';

  @ApiProperty({
    description: 'Pending bookings on this ride awaiting driver action.',
    example: 2,
  })
  pendingBookingCount!: number;

  @ApiProperty({ example: 1 })
  seatsOccupied!: number;

  @ApiProperty({ example: 3 })
  seatsOffered!: number;
}

export class AgendaDriverInfoDto {
  @ApiProperty({ example: 'usr_123' })
  id!: string;

  @ApiProperty({ example: 'Aitana Pérez' })
  name!: string;

  @ApiProperty({
    example: 'https://cdn.example.com/avatars/usr_123.png',
    nullable: true,
  })
  avatar!: string | null;
}

export class AgendaCarInfoDto {
  @ApiProperty({ example: 'Seat' })
  brand!: string;

  @ApiProperty({ example: 'Ibiza' })
  model!: string;

  @ApiProperty({ example: 'black', nullable: true })
  color!: string | null;

  @ApiProperty({ example: 'TEST-1234' })
  plate!: string;
}

export class AgendaPassengerItemDto extends AgendaItemBaseDto {
  @ApiProperty({ enum: ['passenger'], example: 'passenger' })
  role!: 'passenger';

  @ApiProperty({ example: 'bk_1' })
  myBookingId!: string;

  @ApiProperty({ enum: ['accepted', 'pending'], example: 'accepted' })
  myBookingStatus!: 'accepted' | 'pending';

  @ApiProperty({ type: () => AgendaDriverInfoDto })
  driver!: AgendaDriverInfoDto;

  @ApiProperty({ type: () => AgendaCarInfoDto, nullable: true })
  car!: AgendaCarInfoDto | null;

  @ApiProperty({
    description: 'Driver-set trip preference: whether smoking is allowed.',
    example: false,
  })
  smokeAllowed!: boolean;

  @ApiProperty({
    description: 'Driver-set trip preference: whether music is played.',
    example: true,
  })
  musicAllowed!: boolean;

  @ApiProperty({
    description: 'Driver-set conversation style preference for the trip.',
    enum: CONVERSATION_STYLES,
    example: 'casual',
    nullable: true,
  })
  conversationStyle!: ConversationStyle | null;

  @ApiProperty({
    description:
      'Driver-set music genre preference. Null when `musicAllowed` is false or the driver did not pick one.',
    enum: MUSIC_GENRES,
    example: 'indie',
    nullable: true,
  })
  musicGenre!: MusicGenre | null;
}

export type AgendaItemDto = AgendaDriverItemDto | AgendaPassengerItemDto;

@ApiExtraModels(
  AgendaDriverItemDto,
  AgendaPassengerItemDto,
  AgendaDriverInfoDto,
  AgendaCarInfoDto,
)
export class AgendaResponseDto {
  @ApiProperty({
    description:
      'Discriminated union on `role`: driver-rows expose pendingBookingCount + seat counters; passenger-rows expose myBookingId + myBookingStatus + driver + car.',
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(AgendaDriverItemDto) },
        { $ref: getSchemaPath(AgendaPassengerItemDto) },
      ],
      discriminator: {
        propertyName: 'role',
        mapping: {
          driver: getSchemaPath(AgendaDriverItemDto),
          passenger: getSchemaPath(AgendaPassengerItemDto),
        },
      },
    },
  })
  items!: AgendaItemDto[];
}
