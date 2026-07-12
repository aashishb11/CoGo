import { Inject, Injectable } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { calcLevel } from '@modules/users/domain/gamification';
import type { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import type {
  LeaderboardEntryDto,
  LeaderboardResponseDto,
} from './dto/leaderboard-response.dto';
import { LeaderboardRepository } from './leaderboard.repository';

@Injectable()
export class LeaderboardService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly repo: LeaderboardRepository,
  ) {}

  async getLeaderboard(
    query: LeaderboardQueryDto,
  ): Promise<LeaderboardResponseDto> {
    const sortBy = query.sortBy ?? 'xp_points';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.repo.findRanked(this.db, {
        sortBy,
        organizationId: query.organizationId,
        offset,
        limit,
      }),
      this.repo.countRanked(this.db, query.organizationId),
    ]);

    const items: LeaderboardEntryDto[] = rows.map((row, idx) => ({
      rank: offset + idx + 1,
      userId: row.userId,
      username: row.username,
      xpPoints: row.xpPoints,
      level: calcLevel(row.xpPoints),
      totalCo2Saved: row.totalCo2Saved,
      ridesCompleted: row.ridesAsDriver + row.ridesAsPassenger,
      organization: row.organizationId
        ? { id: row.organizationId, name: row.organizationName! }
        : null,
    }));

    return { items, page, limit, total };
  }
}
