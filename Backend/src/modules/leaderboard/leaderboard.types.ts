export const LEADERBOARD_SORT_BY = [
  'co2_saved',
  'xp_points',
  'rides_completed',
] as const;

export type LeaderboardSortBy = (typeof LEADERBOARD_SORT_BY)[number];
