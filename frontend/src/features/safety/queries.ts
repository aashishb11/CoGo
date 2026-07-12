import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createRideIncident, listMyIncidents } from '@/features/safety/api';
import { type CreateIncidentInput } from '@/features/safety/schemas';
import { invalidateAll } from '@/shared/query/invalidation';

export const queryKeys = {
  mine: () => ['incidents', 'mine'] as const,
} as const;

export function useMyIncidents(enabled = true) {
  return useQuery({
    queryKey: queryKeys.mine(),
    queryFn: listMyIncidents,
    enabled,
  });
}

export type CreateIncidentVariables = {
  rideId: string;
  input: CreateIncidentInput;
};

export function useCreateRideIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rideId, input }: CreateIncidentVariables) => createRideIncident(rideId, input),
    onSuccess: () => {
      // Bust the personal incident history so the "My incidents" list shows
      // the new row when the user revisits it.
      invalidateAll(qc, [queryKeys.mine()]);
    },
  });
}
