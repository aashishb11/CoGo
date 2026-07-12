import { useQuery } from '@tanstack/react-query';

import { listInboxRequests } from '@/features/inbox/api';

export const queryKeys = {
  requests: () => ['inbox', 'requests'] as const,
} as const;

export function useInboxRequests(enabled = true) {
  return useQuery({
    queryKey: queryKeys.requests(),
    queryFn: listInboxRequests,
    enabled,
  });
}
