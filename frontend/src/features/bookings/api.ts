import {
  AcceptBookingsSchema,
  RejectBookingsSchema,
  type AcceptBookingsInput,
  type AcceptBookingsPayload,
  CreateBookingsSchema,
  type CreateBookingsInput,
  type CreateBookingsPayload,
  type RejectBookingsInput,
  type RejectBookingsPayload,
} from '@/features/bookings/schemas';
import { apiFetch, validateSchema, withParams } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';

export type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

export type BookingResponse = {
  id: string;
  passengerId: string;
  rideId: string;
  tripId: string;
  status: BookingStatus;
  message?: unknown | null;
  requestedAt: string;
  acceptedAt?: unknown | null;
  rejectedAt?: unknown | null;
  cancelledAt?: unknown | null;
  boardedAt?: string | null;
  fareCents?: number | null;
  scheduledDeparture: string;
};

export type BookingSkipReason = 'RIDE_FULL' | 'RIDE_DEPARTED' | 'ALREADY_TERMINAL';

export type BookingSkip = {
  bookingId: string;
  reason: BookingSkipReason;
};

export type BookingsBatchOutcome = {
  accepted: string[];
  skipped: BookingSkip[];
};

type BookingsBatchCreatedResponse = {
  items?: BookingResponse[];
};

type BookingListResponse = {
  items?: BookingResponse[];
  page?: number;
  limit?: number;
  total?: number;
};

const ENDPOINTS = {
  acceptForTrip: '/api/trips/:tripId/bookings/accept',
  createForTrip: '/api/trips/:tripId/bookings',
  mine: '/api/me/bookings?limit=50',
  rejectForTrip: '/api/trips/:tripId/bookings/reject',
  cancelMine: '/api/bookings/:bookingId/cancel',
  listForRide: '/api/rides/:rideId/bookings',
} as const;

function buildCreateBookingsBody(input: CreateBookingsPayload) {
  const message = input.message?.trim();
  return {
    rideIds: input.rideIds,
    ...(message ? { message } : {}),
  };
}

function buildAcceptBookingsBody(input: AcceptBookingsPayload) {
  return {
    passengerId: input.passengerId,
    ...(input.bookingIds ? { bookingIds: input.bookingIds } : {}),
  };
}

function buildRejectBookingsBody(input: RejectBookingsPayload) {
  const rejectionReason = input.rejectionReason?.trim();
  return {
    passengerId: input.passengerId,
    ...(input.bookingIds ? { bookingIds: input.bookingIds } : {}),
    ...(rejectionReason ? { rejectionReason } : {}),
  };
}

function normalizeTripId(tripId: string, action: string) {
  const normalizedTripId = tripId.trim();
  if (!normalizedTripId) {
    throw new ApiError(`Trip id is required to ${action} booking requests.`);
  }
  return normalizedTripId;
}

export async function createTripBookings(
  tripId: string,
  input: CreateBookingsInput,
): Promise<BookingResponse[]> {
  const normalizedTripId = normalizeTripId(tripId, 'create');
  const parsed = validateSchema(CreateBookingsSchema, input, 'Invalid booking request input');
  const result = await apiFetch<BookingsBatchCreatedResponse>({
    path: withParams(ENDPOINTS.createForTrip, { tripId: normalizedTripId }),
    method: 'POST',
    body: buildCreateBookingsBody(parsed),
  });

  return Array.isArray(result?.items) ? result.items : [];
}

export async function listMyBookings(): Promise<BookingResponse[]> {
  const result = await apiFetch<BookingListResponse>({
    path: ENDPOINTS.mine,
    method: 'GET',
  });

  return Array.isArray(result?.items) ? result.items : [];
}

export async function acceptTripBookings(
  tripId: string,
  input: AcceptBookingsInput,
): Promise<BookingsBatchOutcome> {
  const normalizedTripId = normalizeTripId(tripId, 'accept');
  const parsed = validateSchema(AcceptBookingsSchema, input, 'Invalid booking accept input');

  const result = await apiFetch<BookingsBatchOutcome>({
    path: withParams(ENDPOINTS.acceptForTrip, { tripId: normalizedTripId }),
    method: 'POST',
    body: buildAcceptBookingsBody(parsed),
  });

  return result ?? { accepted: [], skipped: [] };
}

export async function cancelMyBooking(bookingId: string): Promise<void> {
  const normalizedId = bookingId.trim();
  if (!normalizedId) {
    throw new ApiError('Booking id is required to cancel a booking.');
  }
  await apiFetch<void>({
    path: withParams(ENDPOINTS.cancelMine, { bookingId: normalizedId }),
    method: 'POST',
    body: {},
  });
}

export async function listRideBookings(rideId: string): Promise<BookingResponse[]> {
  const normalizedRideId = rideId.trim();
  if (!normalizedRideId) {
    throw new ApiError('Ride id is required to list bookings.');
  }
  const result = await apiFetch<BookingResponse[] | BookingListResponse>({
    path: withParams(ENDPOINTS.listForRide, { rideId: normalizedRideId }),
    method: 'GET',
  });

  if (Array.isArray(result)) {
    return result;
  }
  return Array.isArray(result?.items) ? result.items : [];
}

export async function rejectTripBookings(
  tripId: string,
  input: RejectBookingsInput,
): Promise<BookingsBatchOutcome> {
  const normalizedTripId = normalizeTripId(tripId, 'reject');
  const parsed = validateSchema(RejectBookingsSchema, input, 'Invalid booking reject input');

  const result = await apiFetch<BookingsBatchOutcome>({
    path: withParams(ENDPOINTS.rejectForTrip, { tripId: normalizedTripId }),
    method: 'POST',
    body: buildRejectBookingsBody(parsed),
  });

  return result ?? { accepted: [], skipped: [] };
}
