import { z } from 'zod';

import {
  CreateDriverTripSchema,
  FindPassengerTripsSchema,
  FindRidesSchema,
  type CreateDriverTripInput,
  type FindRidesInput,
} from '@/features/trips/schemas';
import { apiFetch, validateSchema, withParams } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';

export type TripMusicPreference = 'pop' | 'reggaeton' | 'rock' | 'electronic' | 'indie';
export type DriverMusicGenre = 'pop' | 'reggaeton' | 'rock' | 'electronic' | 'indie';
export type ConversationStyle = 'quiet' | 'casual' | 'chatty';

export type TripPreferencesPayload = {
  smoker: boolean;
  conversationStyle: ConversationStyle;
  musicGenres: TripMusicPreference[];
};

// Legacy payload type preserved as-is for local call sites that build a
// search request bag with bare label strings (e.g. create-trip-screen, which
// hands it to the search-trips screen via router params). `findPassengerTrips`
// itself now takes the richer schema input — see `FindPassengerTripsInput`.
export type FindPassengerTripsPayload = {
  origin: string;
  destination: string;
  days: number[];
  time: string;
  preferences: TripPreferencesPayload;
};

// Input accepted by `findPassengerTrips` — derived from the Zod schema so
// origin/destination are structured trip points (label + optional lat/lng).
export type FindPassengerTripsInput = z.input<typeof FindPassengerTripsSchema>;

export type DriverTripPointDto = {
  label: string;
  lat: number;
  lng: number;
};

export type DriverSummaryDto = {
  userId?: string;
  fullName?: string;
  age?: number | null;
  conversationStyle?: ConversationStyle | null;
  smokeAllowed?: boolean;
  musicAllowed?: boolean;
  musicGenre?: DriverMusicGenre | null;
};

export type RecurringDaysDto = {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
};

export type RecurringScheduleDto = {
  daysOfWeek: RecurringDaysDto;
  timeOfDay: string;
};

// Input shape accepted by `createDriverTrip`. Derived from `CreateDriverTripSchema`
// so `days` is a `number[]` (pre-parse), lat/lng are optional, and time is a
// raw `HH:MM` string. The endpoint wrapper runs the value through
// `CreateDriverTripSchema.parse(...)` before handing it to `buildCreateTripBody`.
export type CreateDriverTripPayload = z.input<typeof CreateDriverTripSchema>;

type CreateTripSharedDto = {
  carId: string;
  origin: DriverTripPointDto;
  destination: DriverTripPointDto;
  pricePerSeatCents: number;
  seatsOffered: number;
  smokeAllowed: boolean;
  musicAllowed: boolean;
  musicGenre?: DriverMusicGenre;
  conversationStyle: ConversationStyle;
};

type CreateTripDto =
  | (CreateTripSharedDto & {
      type: 'recurring';
      schedule: RecurringScheduleDto;
      startDate: string;
      endDate: string;
    })
  | (CreateTripSharedDto & {
      type: 'sporadic';
      departureAt: Date;
      externalEventContext?: ExternalEventContext;
    });

export type ExternalEventContext = {
  provider: 'cultucat';
  eventId: string;
};

export type DriverTripDto = {
  id: string;
  driverId?: string;
  driver?: DriverSummaryDto | null;
  type?: 'sporadic' | 'recurring';
  origin: DriverTripPointDto | string;
  destination: DriverTripPointDto | string;
  departureAt?: string | null;
  schedule?: RecurringScheduleDto | null;
  seatsOffered?: number;
  seatsAvailable?: number;
  pricePerSeatCents?: number;
  status?: 'active' | 'cancelled' | 'archived';
  estimatedCo2SavingsPerSeatKg?: number | null;
  routePolyline?: string | null;
  carId?: string;
  carModelBrand?: unknown;
  carModelName?: unknown;
  smokeAllowed?: boolean;
  musicAllowed?: boolean;
  musicGenre?: DriverMusicGenre | null;
  conversationStyle?: ConversationStyle | null;
  externalEventContext?: ExternalEventContext | null;
  // Legacy fields kept as optional for backwards compatibility.
  days?: number[];
  time?: string;
  preferences?: TripPreferencesPayload;
  car?:
    | string
    | {
        id?: string;
        name?: string;
        brand?: string;
        model?: string | { brand?: string; name?: string; model?: string } | null;
        plate?: string;
        registration?: string;
        licensePlate?: string;
      }
    | null;
  createdAt?: string;
};

type TripListResponseDto = {
  items?: DriverTripDto[];
  page?: number;
  limit?: number;
  total?: number;
};

// Subset of the backend `RideSearchItemDto` we actually consume on the
// passenger search screen — keep it narrow so unused fields don't leak into
// our types and the Zod-less unmarshalling stays trivial.
export type RideTripSummary = {
  tripId: string;
  tripType: 'sporadic' | 'recurring';
  driverId: string;
  driverName: string;
  pricePerSeatCents: number;
  conversationStyle?: ConversationStyle | null;
  smokeAllowed: boolean;
  musicAllowed: boolean;
  musicGenre?: DriverMusicGenre | null;
  carModelBrand?: unknown;
  carModelName?: unknown;
};

export type RideStatus = 'active' | 'in_progress' | 'cancelled' | 'completed';

export type RideItem = {
  id: string;
  tripId: string;
  scheduledDeparture: string;
  status: RideStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  origin: DriverTripPointDto;
  destination: DriverTripPointDto;
  totalDistanceKm: number;
  estimatedDurationMinutes?: number | null;
  estimatedCo2SavingsPerSeatKg?: number | null;
  actualCo2SavedKg?: number | null;
  seatsOffered: number;
  seatsOccupied: number;
};

export type RideSearchItem = RideItem & {
  trip: RideTripSummary;
};

type RideSearchResponseDto = {
  items?: RideSearchItem[];
};

type RideListResponseDto = {
  items?: RideItem[];
};

export type AgendaLocationDto = {
  label: string;
  lat?: number;
  lng?: number;
};

export type AgendaDriverInfoDto = {
  id: string;
  name: string;
};

export type AgendaCarInfoDto = {
  brand: string;
  name?: string;
  model?: string;
  plate: string;
  color?: unknown | null;
};

type AgendaItemBase = {
  rideId: string;
  tripId: string;
  tripType: 'sporadic' | 'recurring';
  scheduledDeparture: string;
  origin: AgendaLocationDto;
  destination: AgendaLocationDto;
  totalDistanceKm: number;
  estimatedDurationMinutes?: number | null;
  estimatedCo2SavingsPerSeatKg?: number | null;
  // Agenda excludes cancelled rides, so this only takes 'active' | 'in_progress'
  // | 'completed' in practice. Typed as the broader `RideStatus` for parity
  // with the single-ride endpoint and kept optional for deploys where the
  // field has not landed yet.
  status?: RideStatus;
  /** Timestamp the driver tapped Start. Null while the ride is still `active`. */
  startedAt?: string | null;
  /** Timestamp the ride was completed. Null while `active` or `in_progress`. */
  completedAt?: string | null;
  /** Frozen CO2 saved (kg) once the ride completes. */
  actualCo2SavedKg?: number | null;
  /** Per-seat fare in EUR cents (set by the driver on the parent trip). */
  pricePerSeatCents?: number;
};

export type AgendaDriverItem = AgendaItemBase & {
  role: 'driver';
  pendingBookingCount: number;
  seatsOccupied: number;
  seatsOffered: number;
};

export type AgendaPassengerItem = AgendaItemBase & {
  role: 'passenger';
  myBookingId: string;
  myBookingStatus: 'accepted' | 'pending';
  driver: AgendaDriverInfoDto;
  car?: AgendaCarInfoDto | null;
  /** Driver-set trip preferences, surfaced here so the passenger card can render them. */
  smokeAllowed?: boolean;
  musicAllowed?: boolean;
  conversationStyle?: ConversationStyle | null;
  musicGenre?: DriverMusicGenre | null;
};

export type AgendaItem = AgendaDriverItem | AgendaPassengerItem;

type AgendaResponseDto = {
  items?: AgendaItem[];
};

const ENDPOINTS = {
  findPassenger: '/trips/passenger/find',
  createDriver: '/api/trips',
  listDriver: '/api/me/trips',
  agenda: '/api/me/agenda',
  getTrip: '/api/trips/:tripId',
  updateDriver: '/api/trips/:tripId',
  listTripRides: '/api/trips/:tripId/rides',
  cancelDriver: '/api/trips/:tripId/cancel',
  searchRides: '/api/rides',
  listFavorites: '/api/me/favorites',
  favorite: '/api/me/favorites/:tripId',
  cancelRide: '/api/rides/:rideId/cancel',
  completeRide: '/api/rides/:rideId/complete',
  startRide: '/api/rides/:rideId/start',
} as const;

// Wire-format helper: collapses the `musicGenres[]` client-side state into the
// single `musicGenre` wire field the backend expects. This is request-body
// shaping, not input validation, so it stays out of the Zod schema.
export function resolveMusicGenre(
  musicGenres: TripMusicPreference[],
): DriverMusicGenre | undefined {
  const firstMusicPreference = musicGenres[0];
  if (!firstMusicPreference) {
    return undefined;
  }

  if (firstMusicPreference === 'pop') return 'pop';
  if (firstMusicPreference === 'reggaeton') return 'reggaeton';
  if (firstMusicPreference === 'rock') return 'rock';
  if (firstMusicPreference === 'electronic') return 'electronic';
  if (firstMusicPreference === 'indie') return 'indie';

  return undefined;
}

// Turns the already-normalized schema output into the wire DTO. `input` here
// comes from `CreateDriverTripSchema.parse(...)`, so `time` is already padded,
// origin/destination labels are trimmed (with lat/lng defaulted to 0), and
// `days` is the `RecurringDaysDto` object (not a `number[]`).
function buildCreateTripBody(
  input: CreateDriverTripInput,
  externalEventContext?: ExternalEventContext,
): CreateTripDto {
  const musicGenre = resolveMusicGenre(input.preferences.musicGenres);
  const shared: CreateTripSharedDto = {
    carId: input.carId,
    origin: input.origin,
    destination: input.destination,
    pricePerSeatCents: input.pricePerSeatCents,
    seatsOffered: input.seatsOffered ?? 3,
    smokeAllowed: input.preferences.smoker,
    musicAllowed: input.preferences.musicGenres.length > 0,
    conversationStyle: input.preferences.conversationStyle,
    ...(musicGenre ? { musicGenre } : {}),
  };

  if (input.type === 'sporadic') {
    return {
      ...shared,
      type: 'sporadic',
      departureAt: input.departureAt,
      ...(externalEventContext ? { externalEventContext } : {}),
    };
  }

  return {
    ...shared,
    type: 'recurring',
    schedule: {
      daysOfWeek: input.days,
      timeOfDay: input.time,
    },
    startDate: input.startDate,
    endDate: input.endDate,
  };
}

function normalizeTripListPayload(payload: unknown): DriverTripDto[] {
  if (Array.isArray(payload)) {
    return payload as DriverTripDto[];
  }

  if (payload && typeof payload === 'object') {
    const items = (payload as TripListResponseDto).items;
    if (Array.isArray(items)) {
      return items;
    }
  }

  return [];
}

export async function findPassengerTrips(
  payload: FindPassengerTripsInput,
): Promise<DriverTripDto[]> {
  const body = validateSchema(
    FindPassengerTripsSchema,
    payload,
    'Invalid passenger trip search input',
  );

  const result = await apiFetch<DriverTripDto[]>({
    path: ENDPOINTS.findPassenger,
    method: 'POST',
    body,
  });
  return result ?? [];
}

export async function createDriverTrip(
  payload: CreateDriverTripPayload,
  externalEventContext?: ExternalEventContext,
): Promise<DriverTripDto> {
  const parsed = validateSchema(CreateDriverTripSchema, payload, 'Invalid driver trip input');
  const body = buildCreateTripBody(parsed, externalEventContext);

  const result = await apiFetch<DriverTripDto>({
    path: ENDPOINTS.createDriver,
    method: 'POST',
    body,
  });
  if (!result) {
    throw new ApiError('Failed to create driver trip');
  }
  return result;
}

export async function listDriverTrips(userId?: string): Promise<DriverTripDto[]> {
  const payload = await apiFetch<unknown>({
    path: ENDPOINTS.listDriver,
    method: 'GET',
  });
  return normalizeTripListPayload(payload);
}

export async function listAllTrips(): Promise<DriverTripDto[]> {
  const payload = await apiFetch<unknown>({
    path: ENDPOINTS.listDriver,
    method: 'GET',
  });

  return normalizeTripListPayload(payload);
}

export async function getTripById(tripId: string): Promise<DriverTripDto> {
  const normalizedTripId = tripId.trim();
  if (!normalizedTripId) {
    throw new ApiError('Trip id is required to load trip details.');
  }

  const result = await apiFetch<DriverTripDto>({
    path: withParams(ENDPOINTS.getTrip, { tripId: normalizedTripId }),
    method: 'GET',
  });
  if (!result) {
    throw new ApiError('Trip not found', { status: 404 });
  }
  return result;
}

export async function listFavoriteTrips(): Promise<DriverTripDto[]> {
  const params = new URLSearchParams({
    page: '1',
    limit: '100',
  });

  const payload = await apiFetch<unknown>({
    path: `${ENDPOINTS.listFavorites}?${params.toString()}`,
    method: 'GET',
  });

  return normalizeTripListPayload(payload);
}

export async function favoriteTrip(tripId: string): Promise<void> {
  const normalizedTripId = tripId.trim();
  if (!normalizedTripId) {
    throw new ApiError('Trip id is required to favorite the trip.');
  }

  await apiFetch<void>({
    path: withParams(ENDPOINTS.favorite, { tripId: normalizedTripId }),
    method: 'PUT',
  });
}

export async function unfavoriteTrip(tripId: string): Promise<void> {
  const normalizedTripId = tripId.trim();
  if (!normalizedTripId) {
    throw new ApiError('Trip id is required to remove the trip from favorites.');
  }

  await apiFetch<void>({
    path: withParams(ENDPOINTS.favorite, { tripId: normalizedTripId }),
    method: 'DELETE',
  });
}

export type SearchRidesInput = z.input<typeof FindRidesSchema>;

function buildRidesSearchPath(input: FindRidesInput): string {
  const params = new URLSearchParams({
    originLat: String(input.origin.lat),
    originLng: String(input.origin.lng),
    destinationLat: String(input.destination.lat),
    destinationLng: String(input.destination.lng),
    date: input.date,
    radiusKm: String(input.radiusKm),
    seatsNeeded: String(input.seatsNeeded),
  });
  return `${ENDPOINTS.searchRides}?${params.toString()}`;
}

export async function searchRides(payload: SearchRidesInput): Promise<RideSearchItem[]> {
  const parsed = validateSchema(FindRidesSchema, payload, 'Invalid ride search input');
  const result = await apiFetch<RideSearchResponseDto>({
    path: buildRidesSearchPath(parsed),
    method: 'GET',
  });
  return Array.isArray(result?.items) ? result!.items : [];
}

// Edit-time payload. Intentionally narrower than `CreateDriverTripPayload`:
// the backend rejects schedule-related fields (`departureAt`, `schedule`,
// `startDate`, `endDate`) and the trip `type` after creation, so we never ship
// them on PATCH. Only the editable subset surfaces here.
export type UpdateDriverTripPayload = {
  tripId: string;
  carId: string;
  origin: DriverTripPointDto;
  destination: DriverTripPointDto;
  seatsOffered?: number;
  preferences: TripPreferencesPayload;
};

type UpdateTripDto = {
  carId: string;
  origin: DriverTripPointDto;
  destination: DriverTripPointDto;
  seatsOffered?: number;
  smokeAllowed: boolean;
  musicAllowed: boolean;
  musicGenre?: DriverMusicGenre;
  conversationStyle: ConversationStyle;
};

function buildUpdateTripBody(input: UpdateDriverTripPayload): UpdateTripDto {
  const musicGenre = resolveMusicGenre(input.preferences.musicGenres);
  return {
    carId: input.carId,
    origin: input.origin,
    destination: input.destination,
    smokeAllowed: input.preferences.smoker,
    musicAllowed: input.preferences.musicGenres.length > 0,
    conversationStyle: input.preferences.conversationStyle,
    // Only include `seatsOffered` when the caller passes one — omitting it
    // tells the backend to leave the trip's seat count unchanged. (Defaulting
    // to 3 here would silently downgrade trips with more seats.)
    ...(typeof input.seatsOffered === 'number' ? { seatsOffered: input.seatsOffered } : {}),
    ...(musicGenre ? { musicGenre } : {}),
  };
}

export async function updateDriverTrip(payload: UpdateDriverTripPayload): Promise<DriverTripDto> {
  const normalizedTripId = payload.tripId.trim();
  if (!normalizedTripId) {
    throw new ApiError('Trip id is required to update the trip.');
  }

  const body = buildUpdateTripBody(payload);
  const result = await apiFetch<DriverTripDto>({
    path: withParams(ENDPOINTS.updateDriver, { tripId: normalizedTripId }),
    method: 'PATCH',
    body,
  });
  if (!result) {
    throw new ApiError('Failed to update driver trip');
  }
  return result;
}

export type TripRideStatusFilter = 'active' | 'cancelled' | 'completed' | 'all';

export async function listTripRides(
  tripId: string,
  status: TripRideStatusFilter = 'active',
): Promise<RideItem[]> {
  const normalizedTripId = tripId.trim();
  if (!normalizedTripId) {
    throw new ApiError('Trip id is required to load trip rides.');
  }

  const params = new URLSearchParams({ limit: '50' });
  if (status !== 'all') {
    params.set('status', status);
  }

  const result = await apiFetch<RideListResponseDto>({
    path: `${withParams(ENDPOINTS.listTripRides, { tripId: normalizedTripId })}?${params.toString()}`,
    method: 'GET',
  });

  return Array.isArray(result?.items) ? result.items : [];
}

export async function listMyAgenda(): Promise<AgendaItem[]> {
  const params = new URLSearchParams({
    bookingStatus: 'pending,accepted',
  });

  const result = await apiFetch<AgendaResponseDto>({
    path: `${ENDPOINTS.agenda}?${params.toString()}`,
    method: 'GET',
  });

  return Array.isArray(result?.items) ? result.items : [];
}

export async function cancelDriverTrip(tripId: string): Promise<void> {
  const normalizedTripId = tripId.trim();
  if (!normalizedTripId) {
    throw new ApiError('Trip id is required to cancel the trip.');
  }

  await apiFetch<void>({
    path: withParams(ENDPOINTS.cancelDriver, { tripId: normalizedTripId }),
    method: 'POST',
    body: {},
  });
}

export async function cancelRideInstance(rideId: string): Promise<void> {
  const normalizedRideId = rideId.trim();
  if (!normalizedRideId) {
    throw new ApiError('Ride id is required to cancel this ride.');
  }

  await apiFetch<void>({
    path: withParams(ENDPOINTS.cancelRide, { rideId: normalizedRideId }),
    method: 'POST',
    body: {},
  });
}

export type UnscannedOutcome = {
  bookingId: string;
  outcome: 'boarded' | 'refund';
};

export type CompleteRideInput = {
  rideId: string;
  unscannedOutcomes?: UnscannedOutcome[];
};

export async function completeRideInstance(input: CompleteRideInput): Promise<RideItem> {
  const normalizedRideId = input.rideId.trim();
  if (!normalizedRideId) {
    throw new ApiError('Ride id is required to complete this ride.');
  }

  const body =
    input.unscannedOutcomes && input.unscannedOutcomes.length > 0
      ? { unscannedOutcomes: input.unscannedOutcomes }
      : {};

  const result = await apiFetch<RideItem>({
    path: withParams(ENDPOINTS.completeRide, { rideId: normalizedRideId }),
    method: 'POST',
    body,
  });

  if (!result) {
    throw new ApiError('Failed to complete ride');
  }

  return result;
}

export async function startRideInstance(rideId: string): Promise<RideItem> {
  const normalizedRideId = rideId.trim();
  if (!normalizedRideId) {
    throw new ApiError('Ride id is required to start this ride.');
  }

  const result = await apiFetch<RideItem>({
    path: withParams(ENDPOINTS.startRide, { rideId: normalizedRideId }),
    method: 'POST',
    body: {},
  });

  if (!result) {
    throw new ApiError('Failed to start ride');
  }

  return result;
}
