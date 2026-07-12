import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INCIDENT_CATEGORIES, type IncidentCategory } from '../safety.types';

export class IncidentResponseDto {
  @ApiProperty({ example: 'incident_01HXYZ…' })
  id!: string;

  @ApiProperty({ example: 'ride_01HXYZ…' })
  rideId!: string;

  @ApiProperty({ enum: INCIDENT_CATEGORIES, example: 'unsafe_driving' })
  category!: IncidentCategory;

  @ApiPropertyOptional({ example: null, nullable: true })
  note!: string | null;

  @ApiProperty({ example: '2026-05-25T10:00:00.000Z' })
  createdAt!: Date;
}

export class IncidentListResponseDto {
  @ApiProperty({ type: () => IncidentResponseDto, isArray: true })
  items!: IncidentResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  total!: number;
}
