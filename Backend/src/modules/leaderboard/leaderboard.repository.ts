import { Injectable } from '@nestjs/common';
import { asc, count, desc, eq, sql } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import { organizations, profile, user } from '@core/database/schema';
import type { LeaderboardSortBy } from './leaderboard.types';

export type LeaderboardRow = {
  userId: string;
  username: string;
  xpPoints: number;
  totalCo2Saved: number;
  organizationId: string | null;
  organizationName: string | null;
  ridesAsDriver: number;
  ridesAsPassenger: number;
};

const sortColumn = (sortBy: LeaderboardSortBy) => {
  if (sortBy === 'co2_saved') return desc(profile.totalCo2Saved);
  if (sortBy === 'rides_completed') {
    return desc(sql`${profile.ridesAsDriver} + ${profile.ridesAsPassenger}`);
  }
  return desc(profile.xpPoints);
};

@Injectable()
export class LeaderboardRepository {
  async findRanked(
    tx: DbClient,
    params: {
      sortBy: LeaderboardSortBy;
      organizationId?: string;
      offset: number;
      limit: number;
    },
  ): Promise<LeaderboardRow[]> {
    const primarySort = sortColumn(params.sortBy);
    const secondarySort = asc(profile.userId);

    const query = tx
      .select({
        userId: profile.userId,
        username: profile.username,
        xpPoints: profile.xpPoints,
        totalCo2Saved: profile.totalCo2Saved,
        ridesAsDriver: profile.ridesAsDriver,
        ridesAsPassenger: profile.ridesAsPassenger,
        organizationId: organizations.id,
        organizationName: organizations.name,
      })
      .from(profile)
      .innerJoin(user, eq(user.id, profile.userId))
      .leftJoin(organizations, eq(organizations.id, user.organizationId));

    if (params.organizationId) {
      return query
        .where(eq(user.organizationId, params.organizationId))
        .orderBy(primarySort, secondarySort)
        .limit(params.limit)
        .offset(params.offset);
    }

    return query
      .orderBy(primarySort, secondarySort)
      .limit(params.limit)
      .offset(params.offset);
  }

  async countRanked(tx: DbClient, organizationId?: string): Promise<number> {
    const query = tx
      .select({ total: count(profile.userId) })
      .from(profile)
      .innerJoin(user, eq(user.id, profile.userId));

    const [row] = organizationId
      ? await query.where(eq(user.organizationId, organizationId))
      : await query;

    return row?.total ?? 0;
  }
}
