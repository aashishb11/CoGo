// Admin-only safety DTOs. Reporter-facing types live in `features/safety/`.
// Kept in `features/incidents/` because the admin UI (dashboard tab,
// flagged-rides inbox, ride review) consumes them directly.

export type IncidentCategory = 'harassment' | 'unsafe_driving' | 'accident' | 'other';

export type IncidentResponseDto = {
  id: string;
  rideId: string;
  category: IncidentCategory;
  note: string | null;
  createdAt: string;
};

export type AdminIncidentListItemDto = IncidentResponseDto & {
  reporterId: string;
};

export type AdminIncidentListResponseDto = {
  items: AdminIncidentListItemDto[];
  page: number;
  limit: number;
  total: number;
};

export type AdminIncidentRideDto = {
  id: string;
  scheduledDeparture: string;
  originLabel: string;
  destinationLabel: string;
  tripId: string;
  driverId: string;
  driverName: string;
};

export type AdminIncidentReporterDto = {
  id: string;
  name: string;
  email: string;
  role: 'driver' | 'passenger';
};

export type AdminIncidentDetailDto = {
  id: string;
  category: IncidentCategory;
  note: string | null;
  createdAt: string;
  ride: AdminIncidentRideDto;
  reporter: AdminIncidentReporterDto;
};

// Admin flagged-rides inbox. The backend lists rides with
// `flagged_for_review = true`, hydrated with driver/route/incident-count
// context so the FE can render a table without an extra ride lookup.
export type AdminFlaggedRideListItemDto = {
  rideId: string;
  tripId: string;
  driverId: string;
  driverName: string;
  scheduledDeparture: string;
  status: string;
  originLabel: string;
  destinationLabel: string;
  incidentCount: number;
  lastIncidentAt: string;
};

export type AdminFlaggedRideListResponseDto = {
  items: AdminFlaggedRideListItemDto[];
  page: number;
  limit: number;
  total: number;
};

// `GET /admin/rides/:rideId/review` returns the ride snapshot plus every
// incident reported on it. Incidents are the same shape as the global admin
// list (light payload — `reporterId` is opaque). To show reporter name/role
// the FE fetches `GET /admin/incidents/:id` on demand.
export type AdminRideReviewRideDto = {
  id: string;
  tripId: string;
  driverId: string;
  driverName: string;
  scheduledDeparture: string;
  status: string;
  originLabel: string;
  destinationLabel: string;
  startedAt: string | null;
  completedAt: string | null;
  flaggedForReview: boolean;
};

export type AdminRideReviewDto = {
  ride: AdminRideReviewRideDto;
  incidents: AdminIncidentListItemDto[];
};

export const INCIDENT_CATEGORIES: readonly IncidentCategory[] = [
  'harassment',
  'unsafe_driving',
  'accident',
  'other',
] as const;
