import { useQuery } from '@tanstack/react-query';

import { getLeaderboard } from '@/features/gamification/api';
import type { LeaderboardInput } from '@/features/gamification/types';

export const queryKeys = {
  leaderboard: (input: LeaderboardInput) =>
    [
      'gamification',
      'leaderboard',
      input.sortBy,
      input.organizationId ?? 'global',
      input.page ?? 1,
      input.limit ?? 20,
    ] as const,
  leaderboards: () => ['gamification', 'leaderboard'] as const,
} as const;

export function useLeaderboard(input: LeaderboardInput, enabled = true) {
  return useQuery({
    queryKey: queryKeys.leaderboard(input),
    queryFn: () => getLeaderboard(input),
    enabled,
  });
}
