import type { LeaderboardInput, LeaderboardResponse } from '@/features/gamification/types';
import { apiFetch } from '@/shared/api/client';

export async function getLeaderboard(input: LeaderboardInput): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({
    sortBy: input.sortBy,
    page: String(input.page ?? 1),
    limit: String(input.limit ?? 20),
  });

  if (input.organizationId) {
    params.set('organizationId', input.organizationId);
  }

  const result = await apiFetch<LeaderboardResponse>({
    path: `/api/leaderboard?${params.toString()}`,
    method: 'GET',
  });

  return result ?? { items: [], page: input.page ?? 1, limit: input.limit ?? 20, total: 0 };
}
