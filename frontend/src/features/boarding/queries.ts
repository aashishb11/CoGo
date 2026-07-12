import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getBoardingToken, scanBoarding } from '@/features/boarding/api';
import { type BookingResponse } from '@/features/bookings/api';
import { queryKeys as bookingsQueryKeys } from '@/features/bookings/queries';
import { queryKeys as tripsQueryKeys } from '@/features/trips/queries';
import { invalidateAll } from '@/shared/query/invalidation';

export const queryKeys = {
  boardingToken: (bookingId: string) => ['boarding', 'token', bookingId] as const,
} as const;

// Boarding tokens rotate every ~30s server-side. We refetch every 25s so a
// fresh QR is on screen before the previous one stops accepting scans (the
// server tolerates one slot of skew, so a small buffer is enough).
const TOKEN_REFRESH_INTERVAL_MS = 25_000;

export function useBoardingToken(bookingId: string | null | undefined, enabled = true) {
  const normalizedBookingId = (bookingId ?? '').trim();
  return useQuery({
    queryKey: queryKeys.boardingToken(normalizedBookingId),
    queryFn: () => getBoardingToken(normalizedBookingId),
    enabled: enabled && normalizedBookingId.length > 0,
    refetchInterval: TOKEN_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

export function useScanBoarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => scanBoarding(token),
    onSuccess: (data) => {
      // Optimistic patch: flip the scanned booking's `boardedAt` in the
      // cached ride-bookings list so the driver's live screen reflects the
      // boarded chip immediately, without waiting for the next GET. If a
      // later refetch overwrites this (e.g. backend lag), the user still saw
      // instant feedback first.
      qc.setQueryData<BookingResponse[]>(bookingsQueryKeys.byRide(data.rideId), (prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((booking) =>
          booking.id === data.bookingId
            ? { ...booking, boardedAt: data.boardedAt, fareCents: data.fareCents }
            : booking,
        );
      });

      // Wallet/earnings ledger is updated on the server during the scan — we
      // invalidate by prefix so the wallet refetches its balance, recent
      // transactions and the full history together without needing a userId.
      invalidateAll(qc, [
        bookingsQueryKeys.byRide(data.rideId),
        tripsQueryKeys.agenda(),
        ['wallet'],
      ]);
    },
  });
}
