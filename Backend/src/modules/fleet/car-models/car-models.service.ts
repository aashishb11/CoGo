import { Inject, Injectable } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { CarModelsRepository } from './car-models.repository';

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type SearchOptions = {
  limit?: number;
  offset?: number;
  // When true, collapse multiple-year rows for the same (brand, name) down to
  // the most recent year. Caller-controlled so admin tooling can still page
  // through every year.
  latestYearOnly?: boolean;
};

@Injectable()
export class CarModelsService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly carModelsRepo: CarModelsRepository,
  ) {}

  async search(query: string, opts: SearchOptions = {}) {
    if (!query || query.length < MIN_QUERY_LENGTH) return [];

    return this.carModelsRepo.search(this.db, {
      query,
      limit: clampLimit(opts.limit),
      offset: clampOffset(opts.offset),
      latestYearOnly: Boolean(opts.latestYearOnly),
    });
  }

  async count(query: string, opts: Pick<SearchOptions, 'latestYearOnly'> = {}) {
    if (!query || query.length < MIN_QUERY_LENGTH) return 0;

    return this.carModelsRepo.count(this.db, {
      query,
      latestYearOnly: Boolean(opts.latestYearOnly),
    });
  }
}

function clampLimit(raw: number | undefined): number {
  if (!Number.isFinite(raw)) return DEFAULT_LIMIT;
  const n = Math.floor(raw as number);
  if (n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function clampOffset(raw: number | undefined): number {
  if (!Number.isFinite(raw)) return 0;
  const n = Math.floor(raw as number);
  return n < 0 ? 0 : n;
}
