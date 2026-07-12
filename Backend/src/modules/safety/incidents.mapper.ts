import type { SafetyIncident } from '@core/database/schema/safety-incidents.schema';
import {
  AdminFlaggedRideListItemDto,
  AdminRideReviewRideDto,
} from './dto/admin-ride-review.dto';
import {
  AdminIncidentDetailDto,
  AdminIncidentListItemDto,
} from './dto/admin-incident-detail.dto';
import { IncidentResponseDto } from './dto/incident-response.dto';
import type { AdminIncidentDetailWithRole } from './incidents.service';
import type { FlaggedRideRow, RideReviewRow } from './incidents.repository';

export function toIncidentResponse(row: SafetyIncident): IncidentResponseDto {
  return {
    id: row.id,
    rideId: row.rideId,
    category: row.category,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export function toAdminIncidentListItem(
  row: SafetyIncident,
): AdminIncidentListItemDto {
  return {
    id: row.id,
    rideId: row.rideId,
    reporterId: row.reporterId,
    category: row.category,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export function toAdminIncidentDetail(
  detail: AdminIncidentDetailWithRole,
): AdminIncidentDetailDto {
  return {
    id: detail.id,
    category: detail.category,
    note: detail.note,
    createdAt: detail.createdAt,
    ride: { ...detail.ride },
    reporter: { ...detail.reporter },
  };
}

export function toAdminFlaggedRideListItem(
  row: FlaggedRideRow,
): AdminFlaggedRideListItemDto {
  return {
    rideId: row.rideId,
    tripId: row.tripId,
    driverId: row.driverId,
    driverName: row.driverName,
    scheduledDeparture: row.scheduledDeparture,
    status: row.status,
    originLabel: row.originLabel,
    destinationLabel: row.destinationLabel,
    incidentCount: row.incidentCount,
    lastIncidentAt: row.lastIncidentAt,
  };
}

export function toAdminRideReviewRide(
  row: RideReviewRow,
): AdminRideReviewRideDto {
  return {
    id: row.id,
    tripId: row.tripId,
    driverId: row.driverId,
    driverName: row.driverName,
    scheduledDeparture: row.scheduledDeparture,
    status: row.status,
    originLabel: row.originLabel,
    destinationLabel: row.destinationLabel,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    flaggedForReview: row.flaggedForReview,
  };
}
