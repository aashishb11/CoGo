// Safety-module type tuples. Source of truth for incident `category`
// values; both the DB `.$type<…>()` and the DTOs derive from here so the
// strings can never drift.
export const INCIDENT_CATEGORIES = [
  'harassment',
  'unsafe_driving',
  'accident',
  'other',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
