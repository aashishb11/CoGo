import { randomUUID } from 'node:crypto';
import axios, { AxiosError } from 'axios';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { carModels } from '../src/core/database/schema/car-models.schema';

const YEARS = Array.from({ length: 2025 - 2018 + 1 }, (_, i) => 2018 + i);
// FuelEconomy.gov reports grams of CO2 per mile; car_models stores kg per km.
const KG_PER_KM_FROM_G_PER_MI = 1 / 1609.344;

const HTTP_CONCURRENCY = 8; // parallel requests against fueleconomy.gov
const DB_BATCH_SIZE = 500; // rows per insert query

type MenuItem = { value: string; text: string };
type MenuResponse = { menuItem?: MenuItem | MenuItem[] };

type VehicleDetail = {
  make: string;
  model: string;
  VClass?: string;
  co2TailpipeGpm?: string | number;
};

type CarModelRow = typeof carModels.$inferInsert;

const http = axios.create({
  baseURL: 'https://www.fueleconomy.gov/ws/rest/vehicle',
  headers: { Accept: 'application/json' },
  timeout: 15_000,
});

async function fetchMenu(
  path: string,
  params: Record<string, string | number>,
) {
  const res = await http.get<MenuResponse>(path, { params });
  const item = res.data?.menuItem;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

// Shared promise-pool — runs `fn` over `items` with at most `concurrency` in
// flight at once. No external dep; the algorithm is N workers pulling from a
// shared cursor.
async function pmap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function describeError(err: unknown): string {
  if (err instanceof AxiosError) return err.message;
  const cause = (err as { cause?: { message?: string; code?: string } })?.cause;
  if (cause?.message) {
    return cause.code ? `${cause.message} (pg ${cause.code})` : cause.message;
  }
  return String(err);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const safeUrl = databaseUrl.replace(/:\/\/[^@]+@/, '://***:***@');
  console.log(`[import] target: ${safeUrl}`);

  const client = postgres(databaseUrl, { max: 4, prepare: false });
  const db = drizzle(client);

  // Fail fast: prove we can actually talk to the DB before doing thousands of
  // HTTP calls. Without this, a wrong DATABASE_URL or auth failure would let
  // the importer churn for hours emitting per-row "Failed query" noise.
  try {
    await client`SELECT 1`;
    console.log('[import] db connection OK');
  } catch (err) {
    await client.end();
    console.error(`[import] db connection FAILED: ${describeError(err)}`);
    process.exit(1);
  }

  let inserted = 0;
  let skipped = 0;
  let httpFailed = 0;

  try {
    for (const year of YEARS) {
      console.log(`\n=== ${year} ===`);

      const makes = await fetchMenu('/menu/make', { year });
      console.log(`[import] ${year}: ${makes.length} makes`);

      // Stage 1: fan out (year, make) → list of (year, make, model)
      const triples: { year: number; make: string; model: string }[] = [];
      await pmap(makes, HTTP_CONCURRENCY, async (make) => {
        try {
          const models = await fetchMenu('/menu/model', {
            year,
            make: make.text,
          });
          for (const m of models)
            triples.push({ year, make: make.text, model: m.text });
        } catch (err) {
          httpFailed++;
          console.error(
            `  ! ${year} ${make.text} (models): ${describeError(err)}`,
          );
        }
      });

      // Stage 2: fan out triples → row-or-null. One row per (brand, name, year)
      // by picking the first trim. Network failures count as skipped but don't
      // abort the run.
      const rows: (CarModelRow | null)[] = await pmap(
        triples,
        HTTP_CONCURRENCY,
        async (t) => {
          try {
            const options = await fetchMenu('/menu/options', {
              year: t.year,
              make: t.make,
              model: t.model,
            });
            const opt = options[0];
            if (!opt) return null;

            const detail = await http.get<VehicleDetail>(`/${opt.value}`);
            const d = detail.data;
            const gpm = Number(d.co2TailpipeGpm);
            if (!Number.isFinite(gpm) || gpm <= 0) return null;

            return {
              id: randomUUID(),
              brand: d.make,
              name: d.model,
              year: t.year,
              type: d.VClass ?? 'Unknown',
              co2KgPerKm: gpm * KG_PER_KM_FROM_G_PER_MI,
            };
          } catch (err) {
            httpFailed++;
            console.error(
              `  ! ${t.year} ${t.make} ${t.model}: ${describeError(err)}`,
            );
            return null;
          }
        },
      );

      const yearRows = rows.filter((r): r is CarModelRow => r !== null);
      skipped += rows.length - yearRows.length;

      // Stage 3: batch insert. Each batch is one query with ON CONFLICT DO
      // NOTHING; .returning({id}) tells us how many were actually new vs
      // duplicates the unique index swallowed.
      let yearInserted = 0;
      for (let i = 0; i < yearRows.length; i += DB_BATCH_SIZE) {
        const batch = yearRows.slice(i, i + DB_BATCH_SIZE);
        try {
          const ids = await db
            .insert(carModels)
            .values(batch)
            .onConflictDoNothing({
              target: [carModels.brand, carModels.name, carModels.year],
            })
            .returning({ id: carModels.id });
          yearInserted += ids.length;
          skipped += batch.length - ids.length;
        } catch (err) {
          // DB errors are structural (auth, schema, constraint) — they will
          // recur for every batch, so abort instead of churning.
          console.error(
            `[import] DB insert FAILED on batch of ${batch.length}: ${describeError(err)}`,
          );
          throw err;
        }
      }

      inserted += yearInserted;
      console.log(
        `[import] ${year}: +${yearInserted} new, ${yearRows.length - yearInserted} dupes`,
      );
    }
  } finally {
    await client.end();
  }

  console.log(
    `\nDone. Inserted: ${inserted}  Skipped: ${skipped}  HTTP-failed: ${httpFailed}`,
  );
  return httpFailed;
}

main()
  .then((httpFailed) => {
    process.exit(httpFailed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Import failed:', describeError(err));
    process.exit(1);
  });
