import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getAdminIncidentById,
  getRideReview,
  listAdminIncidents,
  listFlaggedRides,
  resolveRideReview,
} from '@/features/incidents/api';
import { invalidateAll } from '@/shared/query/invalidation';

const INCIDENTS_PAGE_SIZE = 20;

export const queryKeys = {
  adminIncidents: () => ['incidents', 'admin', 'list'] as const,
  adminIncident: (id: string) => ['incidents', 'admin', 'detail', id] as const,
  adminFlaggedRides: () => ['incidents', 'admin', 'flagged-rides'] as const,
  adminRideReview: (rideId: string) => ['incidents', 'admin', 'ride-review', rideId] as const,
} as const;

export function useAdminIncidents(enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.adminIncidents(),
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => listAdminIncidents(pageParam, INCIDENTS_PAGE_SIZE),
    getNextPageParam: (lastPage) => {
      const totalLoaded = lastPage.page * lastPage.limit;
      if (totalLoaded >= lastPage.total) return undefined;
      return lastPage.page + 1;
    },
  });
}

export function useAdminIncident(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.adminIncident(id ?? ''),
    queryFn: () => getAdminIncidentById(id as string),
    enabled: Boolean(id),
  });
}

export function useFlaggedRides(enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.adminFlaggedRides(),
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => listFlaggedRides(pageParam, INCIDENTS_PAGE_SIZE),
    getNextPageParam: (lastPage) => {
      const totalLoaded = lastPage.page * lastPage.limit;
      if (totalLoaded >= lastPage.total) return undefined;
      return lastPage.page + 1;
    },
  });
}

export function useRideReview(rideId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.adminRideReview(rideId ?? ''),
    queryFn: () => getRideReview(rideId as string),
    enabled: Boolean(rideId),
  });
}

export function useResolveRideReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rideId: string) => resolveRideReview(rideId),
    onSuccess: (_data, rideId) => {
      invalidateAll(qc, [queryKeys.adminFlaggedRides(), queryKeys.adminRideReview(rideId)]);
    },
  });
}
