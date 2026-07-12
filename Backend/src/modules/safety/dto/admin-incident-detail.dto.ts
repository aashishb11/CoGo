import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INCIDENT_CATEGORIES, type IncidentCategory } from '../safety.types';

export class AdminIncidentReporterDto {
  @ApiProperty({ example: 'user_01HXYZ…' })
  id!: string;

  @ApiProperty({ example: 'Alex Driver' })
  name!: string;

  @ApiProperty({ example: 'alex@example.com' })
  email!: string;

  @ApiProperty({
    enum: ['driver', 'passenger'],
    example: 'passenger',
    description: 'Reporter role on the ride at the time of submission.',
  })
  role!: 'driver' | 'passenger';
}

export class AdminIncidentRideDto {
  @ApiProperty({ example: 'ride_01HXYZ…' })
  id!: string;

  @ApiProperty({ example: '2026-05-25T08:00:00.000Z' })
  scheduledDeparture!: Date;

  @ApiProperty({ example: 'Plaça Catalunya, Barcelona' })
  originLabel!: string;

  @ApiProperty({ example: 'UPC Campus Nord' })
  destinationLabel!: string;

  @ApiProperty({ example: 'trip_01HXYZ…' })
  tripId!: string;

  @ApiProperty({ example: 'user_01HXYZ…' })
  driverId!: string;

  @ApiProperty({ example: 'Driver Name' })
  driverName!: string;
}

export class AdminIncidentDetailDto {
  @ApiProperty({ example: 'incident_01HXYZ…' })
  id!: string;

  @ApiProperty({ enum: INCIDENT_CATEGORIES, example: 'unsafe_driving' })
  category!: IncidentCategory;

  @ApiPropertyOptional({ example: 'Driver was speeding', nullable: true })
  note!: string | null;

  @ApiProperty({ example: '2026-05-25T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ type: () => AdminIncidentRideDto })
  ride!: AdminIncidentRideDto;

  @ApiProperty({ type: () => AdminIncidentReporterDto })
  reporter!: AdminIncidentReporterDto;
}

export class AdminIncidentListItemDto {
  @ApiProperty({ example: 'incident_01HXYZ…' })
  id!: string;

  @ApiProperty({ example: 'ride_01HXYZ…' })
  rideId!: string;

  @ApiProperty({ example: 'user_01HXYZ…' })
  reporterId!: string;

  @ApiProperty({ enum: INCIDENT_CATEGORIES, example: 'unsafe_driving' })
  category!: IncidentCategory;

  @ApiPropertyOptional({ example: null, nullable: true })
  note!: string | null;

  @ApiProperty({ example: '2026-05-25T10:00:00.000Z' })
  createdAt!: Date;
}

export class AdminIncidentListResponseDto {
  @ApiProperty({ type: () => AdminIncidentListItemDto, isArray: true })
  items!: AdminIncidentListItemDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  total!: number;
}
