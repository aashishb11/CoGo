import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  acceptTripBookings,
  cancelMyBooking,
  createTripBookings,
  listMyBookings,
  listRideBookings,
  rejectTripBookings,
} from '@/features/bookings/api';
import {
  type AcceptBookingsInput,
  type CreateBookingsInput,
  type RejectBookingsInput,
} from '@/features/bookings/schemas';
import { queryKeys as inboxQueryKeys } from '@/features/inbox/queries';
import { queryKeys as tripsQueryKeys } from '@/features/trips/queries';
import { invalidateAll } from '@/shared/query/invalidation';

export const queryKeys = {
  all: () => ['bookings'] as const,
  mine: () => ['bookings', 'mine'] as const,
  byRide: (rideId: string) => ['bookings', 'ride', rideId] as const,
} as const;

export type AcceptTripBookingsVariables = {
  tripId: string;
  input: AcceptBookingsInput;
};

export type CreateTripBookingsVariables = {
  tripId: string;
  input: CreateBookingsInput;
};

export type RejectTripBookingsVariables = {
  tripId: string;
  input: RejectBookingsInput;
};

function invalidateBookingState(queryClient: QueryClient) {
  invalidateAll(queryClient, [queryKeys.all(), queryKeys.mine(), inboxQueryKeys.requests()]);
}

export function useMyBookings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.mine(),
    queryFn: listMyBookings,
    enabled,
  });
}

export function useRideBookings(rideId: string | null | undefined, enabled = true) {
  const normalizedRideId = (rideId ?? '').trim();
  return useQuery({
    queryKey: queryKeys.byRide(normalizedRideId),
    queryFn: () => listRideBookings(normalizedRideId),
    enabled: enabled && normalizedRideId.length > 0,
  });
}

export function useAcceptTripBookings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tripId, input }: AcceptTripBookingsVariables) =>
      acceptTripBookings(tripId, input),
    onSuccess: () => {
      invalidateBookingState(queryClient);
    },
  });
}

export function useCreateTripBookings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tripId, input }: CreateTripBookingsVariables) =>
      createTripBookings(tripId, input),
    onSuccess: () => {
      invalidateBookingState(queryClient);
    },
  });
}

export function useCancelMyBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) => cancelMyBooking(bookingId),
    onSuccess: () => {
      invalidateBookingState(queryClient);
      invalidateAll(queryClient, [tripsQueryKeys.agenda()]);
    },
  });
}

export function useRejectTripBookings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tripId, input }: RejectTripBookingsVariables) =>
      rejectTripBookings(tripId, input),
    onSuccess: () => {
      invalidateBookingState(queryClient);
    },
  });
}
