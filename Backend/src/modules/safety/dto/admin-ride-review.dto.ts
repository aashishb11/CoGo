import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminIncidentListItemDto } from './admin-incident-detail.dto';

export class AdminFlaggedRideListItemDto {
  @ApiProperty({ example: 'ride_01HXYZ…' })
  rideId!: string;

  @ApiProperty({ example: 'trip_01HXYZ…' })
  tripId!: string;

  @ApiProperty({ example: 'user_01HXYZ…' })
  driverId!: string;

  @ApiProperty({ example: 'Driver Name' })
  driverName!: string;

  @ApiProperty({ example: '2026-05-25T08:00:00.000Z' })
  scheduledDeparture!: Date;

  @ApiProperty({ example: 'in_progress' })
  status!: string;

  @ApiProperty({ example: 'Plaça Catalunya, Barcelona' })
  originLabel!: string;

  @ApiProperty({ example: 'UPC Campus Nord' })
  destinationLabel!: string;

  @ApiProperty({ example: 3 })
  incidentCount!: number;

  @ApiProperty({
    example: '2026-05-25T10:00:00.000Z',
    description: 'Timestamp of the most recent incident on this ride.',
  })
  lastIncidentAt!: Date;
}

export class AdminFlaggedRideListResponseDto {
  @ApiProperty({ type: () => AdminFlaggedRideListItemDto, isArray: true })
  items!: AdminFlaggedRideListItemDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  total!: number;
}

export class AdminRideReviewRideDto {
  @ApiProperty({ example: 'ride_01HXYZ…' })
  id!: string;

  @ApiProperty({ example: 'trip_01HXYZ…' })
  tripId!: string;

  @ApiProperty({ example: 'user_01HXYZ…' })
  driverId!: string;

  @ApiProperty({ example: 'Driver Name' })
  driverName!: string;

  @ApiProperty({ example: '2026-05-25T08:00:00.000Z' })
  scheduledDeparture!: Date;

  @ApiProperty({ example: 'in_progress' })
  status!: string;

  @ApiProperty({ example: 'Plaça Catalunya, Barcelona' })
  originLabel!: string;

  @ApiProperty({ example: 'UPC Campus Nord' })
  destinationLabel!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  startedAt!: Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ example: true })
  flaggedForReview!: boolean;
}

export class AdminRideReviewDto {
  @ApiProperty({ type: () => AdminRideReviewRideDto })
  ride!: AdminRideReviewRideDto;

  @ApiProperty({ type: () => AdminIncidentListItemDto, isArray: true })
  incidents!: AdminIncidentListItemDto[];
}
