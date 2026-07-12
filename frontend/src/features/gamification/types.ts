export type GamificationBadge = {
  id: string;
  awardedAt: string;
};

export type GamificationStats = {
  totalCo2Saved?: number | null;
  equivalentTreesPerYear?: number | null;
  equivalentFuelLitresSaved?: number | null;
  xpPoints?: number | null;
  level?: number | null;
  xpToNextLevel?: number | null;
  ridesAsDriver?: number | null;
  ridesAsPassenger?: number | null;
  badges?: GamificationBadge[] | null;
};

export type LeaderboardSort = 'xp_points' | 'co2_saved' | 'rides_completed';

export type LeaderboardScope = 'community' | 'global';

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  xpPoints: number;
  level: number;
  totalCo2Saved: number;
  ridesCompleted: number;
  organization?: { id: string; name: string } | null;
};

export type LeaderboardResponse = {
  items: LeaderboardEntry[];
  page: number;
  limit: number;
  total: number;
};

export type LeaderboardInput = {
  sortBy: LeaderboardSort;
  organizationId?: string | null;
  page?: number;
  limit?: number;
};
