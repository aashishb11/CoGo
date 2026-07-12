export const TRIP_TYPES = ['sporadic', 'recurring'] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export const TRIP_STATUSES = ['active', 'cancelled', 'archived'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const RIDE_STATUSES = [
  'active',
  'in_progress',
  'cancelled',
  'completed',
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const BOOKING_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const CONVERSATION_STYLES = ['quiet', 'casual', 'chatty'] as const;
export type ConversationStyle = (typeof CONVERSATION_STYLES)[number];

export const MUSIC_GENRES = [
  'pop',
  'reggaeton',
  'rock',
  'electronic',
  'indie',
] as const;
export type MusicGenre = (typeof MUSIC_GENRES)[number];

export const DAY_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type DayOfWeek = (typeof DAY_OF_WEEK)[number];
export type DaysOfWeek = Record<DayOfWeek, boolean>;

export interface Location {
  label: string;
  lat: number;
  lng: number;
}

export interface RecurringSchedule {
  daysOfWeek: DaysOfWeek;
  timeOfDay: string;
}

// Both trips and rides repositories project the driver join with these
// four columns. Centralised here so mapper inputs stay in sync with the
// repo selects.
export type DriverJoinColumns = {
  driverId: string;
  driverName: string;
  driverOrganizationId: string | null;
  driverOrganizationName: string | null;
};

export function toDriverRecord(row: DriverJoinColumns) {
  return {
    id: row.driverId,
    name: row.driverName,
    organization: row.driverOrganizationId
      ? { id: row.driverOrganizationId, name: row.driverOrganizationName ?? '' }
      : null,
  };
}
