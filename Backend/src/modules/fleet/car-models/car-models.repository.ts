import { Injectable } from '@nestjs/common';
import { asc, desc, ilike, or, sql } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import { carModels } from '@core/database/schema';
import type { CarModel } from '@core/database/schema/car-models.schema';

type SearchOpts = {
  query: string;
  limit: number;
  offset: number;
  latestYearOnly: boolean;
};

type CountOpts = {
  query: string;
  latestYearOnly: boolean;
};

@Injectable()
export class CarModelsRepository {
  async search(tx: DbClient, opts: SearchOpts): Promise<CarModel[]> {
    const where = buildWhere(opts.query);

    if (opts.latestYearOnly) {
      // DISTINCT ON (brand, name) keeps the row with the highest year per
      // (brand, name) thanks to ORDER BY year DESC. Still cheap because the
      // unique index already covers (brand, name, year).
      return tx
        .selectDistinctOn([carModels.brand, carModels.name])
        .from(carModels)
        .where(where)
        .orderBy(
          asc(carModels.brand),
          asc(carModels.name),
          desc(carModels.year),
        )
        .limit(opts.limit)
        .offset(opts.offset);
    }

    return tx
      .select()
      .from(carModels)
      .where(where)
      .orderBy(asc(carModels.brand), asc(carModels.name), desc(carModels.year))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async count(tx: DbClient, opts: CountOpts): Promise<number> {
    const where = buildWhere(opts.query);

    if (opts.latestYearOnly) {
      const [row] = await tx
        .select({
          n: sql<number>`count(distinct (${carModels.brand}, ${carModels.name}))::int`,
        })
        .from(carModels)
        .where(where);
      return row?.n ?? 0;
    }

    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(carModels)
      .where(where);
    return row?.n ?? 0;
  }
}

function buildWhere(query: string) {
  const pattern = `%${escapeLikePattern(query)}%`;
  return or(ilike(carModels.brand, pattern), ilike(carModels.name, pattern));
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
