import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys as gamificationQueryKeys } from '@/features/gamification/queries';
import { queryKeys as profileQueryKeys } from '@/features/profile/queries';
import {
  cancelDriverTrip,
  cancelRideInstance,
  completeRideInstance,
  createDriverTrip,
  favoriteTrip,
  findPassengerTrips,
  getTripById,
  listAllTrips,
  listDriverTrips,
  listFavoriteTrips,
  listMyAgenda,
  listTripRides,
  searchRides,
  startRideInstance,
  unfavoriteTrip,
  updateDriverTrip,
  type CompleteRideInput,
  type CreateDriverTripPayload,
  type DriverTripDto,
  type ExternalEventContext,
  type FindPassengerTripsInput,
  type SearchRidesInput,
  type TripRideStatusFilter,
  type UpdateDriverTripPayload,
} from '@/features/trips/api';
import { invalidateAll } from '@/shared/query/invalidation';

export const queryKeys = {
  driverTrips: (userId?: string) => ['trips', 'driver', userId ?? 'all'] as const,
  allTrips: () => ['trips', 'all'] as const,
  passengerSearch: (filter: FindPassengerTripsInput) => ['trips', 'passenger', filter] as const,
  rideSearch: (filter: SearchRidesInput) => ['rides', 'search', filter] as const,
  agenda: () => ['trips', 'agenda'] as const,
  tripRides: (tripId: string, status: TripRideStatusFilter = 'active') =>
    ['trips', tripId, 'rides', status] as const,
  trip: (id: string) => ['trips', id] as const,
  favoriteTrips: () => ['trips', 'favorites'] as const,
  favoriteTripIds: () => ['trips', 'favorites', 'ids'] as const,
} as const;

export function useDriverTrips(userId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.driverTrips(userId ?? undefined),
    queryFn: () => listDriverTrips(userId ?? undefined),
    enabled: Boolean(userId),
  });
}

// `listAllTrips` is used by the passenger-facing screen — it returns every
// active trip. Kept under its own key so `useDriverTrips` invalidations don't
// accidentally clobber the passenger list.
export function useAllDriverTrips() {
  return useQuery({
    queryKey: queryKeys.allTrips(),
    queryFn: () => listAllTrips(),
  });
}

export function useMyAgenda(enabled = true) {
  return useQuery({
    queryKey: queryKeys.agenda(),
    queryFn: listMyAgenda,
    enabled,
  });
}

export function useTripById(tripId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.trip(tripId ?? ''),
    queryFn: () => getTripById(tripId as string),
    enabled: Boolean(tripId && tripId.length > 0),
  });
}

export function useFavoriteTrips(enabled = true) {
  return useQuery({
    queryKey: queryKeys.favoriteTrips(),
    queryFn: listFavoriteTrips,
    enabled,
  });
}

export function useFavoriteTripIds(enabled = true) {
  return useQuery({
    queryKey: queryKeys.favoriteTripIds(),
    queryFn: async () => {
      const trips = await listFavoriteTrips();
      return trips.map((trip) => trip.id);
    },
    enabled,
  });
}

function invalidateTrips(qc: ReturnType<typeof useQueryClient>, userId: string | null | undefined) {
  invalidateAll(qc, [queryKeys.driverTrips(userId ?? undefined), queryKeys.allTrips()]);
}

export type CreateDriverTripWithContextPayload = CreateDriverTripPayload & {
  externalEventContext?: ExternalEventContext;
};

export function useCreateDriverTrip(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ externalEventContext, ...payload }: CreateDriverTripWithContextPayload) =>
      createDriverTrip(payload, externalEventContext),
    onSuccess: () => invalidateTrips(qc, userId),
  });
}

export function useUpdateDriverTrip(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateDriverTripPayload) => updateDriverTrip(payload),
    onSuccess: (_data, variables) => {
      invalidateAll(qc, [
        queryKeys.driverTrips(userId ?? undefined),
        queryKeys.allTrips(),
        queryKeys.trip(variables.tripId),
      ]);
    },
  });
}

export function useCancelDriverTrip(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => cancelDriverTrip(tripId),
    onSuccess: () => {
      invalidateTrips(qc, userId);
      invalidateAll(qc, [queryKeys.agenda()]);
    },
  });
}

export function useCancelRideInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rideId: string) => cancelRideInstance(rideId),
    onSuccess: () => {
      invalidateAll(qc, [queryKeys.agenda()]);
    },
  });
}

export function useCompleteRideInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CompleteRideInput) => completeRideInstance(input),
    onSuccess: (completedRide, variables) => {
      // Complete writes the per-booking settlement (payment/earning ledger
      // pairs), freezes the ride CO2, then the backend awards gamification
      // from the RIDE_COMPLETED event. Bust immediate readers now and repeat
      // profile/leaderboard shortly after so async event writes are picked up.
      const tripKeys = completedRide.tripId
        ? [
            queryKeys.trip(completedRide.tripId),
            queryKeys.tripRides(completedRide.tripId, 'active'),
            queryKeys.tripRides(completedRide.tripId, 'all'),
          ]
        : [];
      const immediateKeys = [
        queryKeys.agenda(),
        queryKeys.allTrips(),
        gamificationQueryKeys.leaderboards(),
        profileQueryKeys.myProfile(),
        profileQueryKeys.mySustainability(),
        profileQueryKeys.tabsHeaderUsername(),
        ['profile'],
        ['bookings'],
        ['bookings', 'ride', variables.rideId],
        ['wallet'],
        ...tripKeys,
      ];
      const eventualGamificationKeys = [
        gamificationQueryKeys.leaderboards(),
        profileQueryKeys.myProfile(),
        profileQueryKeys.mySustainability(),
        ['profile'],
      ];

      invalidateAll(qc, immediateKeys);
      setTimeout(() => invalidateAll(qc, eventualGamificationKeys), 1200);
    },
  });
}

export function useStartRideInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rideId: string) => startRideInstance(rideId),
    onSuccess: (_data, rideId) => {
      // Status flips active → in_progress; the agenda gates the boarding/scan
      // CTAs on this status and the per-trip ride list shows the new state.
      invalidateAll(qc, [queryKeys.agenda(), queryKeys.tripRides(rideId, 'all')]);
    },
  });
}

type ToggleFavoriteInput = {
  tripId: string;
  isFavorite: boolean;
};

function removeFavoriteFromTripList(trips: DriverTripDto[] | undefined, tripId: string) {
  if (!trips) return trips;
  return trips.filter((trip) => trip.id !== tripId);
}

export function useToggleFavoriteTrip() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ tripId, isFavorite }: ToggleFavoriteInput) =>
      isFavorite ? unfavoriteTrip(tripId) : favoriteTrip(tripId),
    onMutate: async ({ tripId, isFavorite }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.favoriteTripIds() }),
        qc.cancelQueries({ queryKey: queryKeys.favoriteTrips() }),
      ]);

      const previousFavoriteIds = qc.getQueryData<string[]>(queryKeys.favoriteTripIds());
      const previousFavoriteTrips = qc.getQueryData<DriverTripDto[]>(queryKeys.favoriteTrips());

      qc.setQueryData<string[]>(queryKeys.favoriteTripIds(), (current = []) => {
        if (isFavorite) {
          return current.filter((id) => id !== tripId);
        }
        return current.includes(tripId) ? current : [...current, tripId];
      });

      if (isFavorite) {
        qc.setQueryData<DriverTripDto[]>(queryKeys.favoriteTrips(), (current) =>
          removeFavoriteFromTripList(current, tripId),
        );
      }

      return { previousFavoriteIds, previousFavoriteTrips };
    },
    onError: (_error, _variables, context) => {
      if (context) {
        qc.setQueryData(queryKeys.favoriteTripIds(), context.previousFavoriteIds ?? []);
        qc.setQueryData(queryKeys.favoriteTrips(), context.previousFavoriteTrips ?? []);
      }
    },
    onSettled: (_data, _error, variables) => {
      invalidateAll(qc, [
        queryKeys.favoriteTripIds(),
        queryKeys.favoriteTrips(),
        queryKeys.trip(variables.tripId),
        queryKeys.allTrips(),
      ]);
    },
  });
}

export function useFindPassengerTrips(payload: FindPassengerTripsInput | null) {
  return useQuery({
    queryKey: payload ? queryKeys.passengerSearch(payload) : ['trips', 'passenger', 'disabled'],
    queryFn: () => findPassengerTrips(payload as FindPassengerTripsInput),
    enabled: Boolean(payload),
  });
}

export function useSearchRides(payload: SearchRidesInput | null) {
  return useQuery({
    queryKey: payload ? queryKeys.rideSearch(payload) : ['rides', 'search', 'disabled'],
    queryFn: () => searchRides(payload as SearchRidesInput),
    enabled: Boolean(payload),
  });
}

export function useTripRides(
  tripId: string | null | undefined,
  status: TripRideStatusFilter = 'active',
) {
  return useQuery({
    queryKey: tripId ? queryKeys.tripRides(tripId, status) : ['trips', 'rides', 'disabled'],
    queryFn: () => listTripRides(tripId as string, status),
    enabled: Boolean(tripId),
  });
}
