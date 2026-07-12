import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import {
  TripListResponseDto,
  TripResponseDto,
} from '../trips/dto/trips-response.dto';
import { toTripResponse } from '../trips/trips.mapper';
import { TripsRepository } from '../trips/trips.repository';
import { toDriverRecord, type TripStatus } from '../trips.types';
import { MeFavoritesQueryDto } from './dto/me-favorites-query.dto';
import { FavoritesRepository } from './favorites.repository';

const VISIBLE_STATUSES: TripStatus[] = ['active'];

@Injectable()
export class FavoritesService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly favoritesRepo: FavoritesRepository,
    private readonly tripsRepo: TripsRepository,
  ) {}

  async favorite(userId: string, tripId: string): Promise<void> {
    if (!(await this.tripsRepo.exists(this.db, tripId))) {
      throw new NotFoundException('Trip not found');
    }
    await this.favoritesRepo.add(this.db, userId, tripId);
  }

  async unfavorite(userId: string, tripId: string): Promise<void> {
    // pre: idempotent — missing trip / row is a no-op (no FK target needed for DELETE).
    await this.favoritesRepo.remove(this.db, userId, tripId);
  }

  async listMine(
    userId: string,
    query: MeFavoritesQueryDto,
  ): Promise<TripListResponseDto> {
    const rows = await this.favoritesRepo.listMineWithTripAndDriver(
      this.db,
      userId,
      VISIBLE_STATUSES,
    );

    const total = rows.length;
    const offset = (query.page - 1) * query.limit;
    const items: TripResponseDto[] = rows
      .slice(offset, offset + query.limit)
      .map((row) =>
        toTripResponse(row.trip, toDriverRecord(row), row.co2KgPerKm),
      );

    return { items, page: query.page, limit: query.limit, total };
  }
}
