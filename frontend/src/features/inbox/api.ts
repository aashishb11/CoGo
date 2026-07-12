import { apiFetch } from '@/shared/api/client';

export type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

export type InboxBooking = {
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
  scheduledDeparture: string;
};

export type InboxTrip = {
  originLabel: string;
  destinationLabel: string;
  type: 'sporadic' | 'recurring';
};

export type InboxPassenger = {
  id: string;
  name: string;
  avatar?: unknown | null;
};

export type InboxItem = {
  tripId: string;
  trip: InboxTrip;
  passenger: InboxPassenger;
  bookings: InboxBooking[];
  pendingCount: number;
  acceptedCount: number;
  oldestPendingAt?: unknown | null;
};

type InboxResponse = {
  items?: InboxItem[];
  page?: number;
  limit?: number;
  total?: number;
};

const ENDPOINTS = {
  inbox: '/api/me/inbox',
} as const;

export async function listInboxRequests(): Promise<InboxItem[]> {
  const result = await apiFetch<InboxResponse>({
    path: ENDPOINTS.inbox,
    method: 'GET',
  });

  return Array.isArray(result?.items) ? result.items : [];
}
