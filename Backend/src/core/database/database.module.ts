import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import type {
  PostgresJsDatabase,
  PostgresJsQueryResultHKT,
} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DB = Symbol('DB');
const DB_CLIENT = Symbol('DB_CLIENT');

export type Schema = typeof schema;

// Accept both the global drizzle client and a tx-bound client. Helpers and
// services declare `tx: DbClient` so the same code path works inside or
// outside `db.transaction(...)` without TS complaints.
export type DbClient =
  | PostgresJsDatabase<Schema>
  | PgTransaction<
      PostgresJsQueryResultHKT,
      Schema,
      ExtractTablesWithRelations<Schema>
    >;

@Global()
@Module({
  providers: [
    {
      provide: DB_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        postgres(config.getOrThrow<string>('DATABASE_URL'), {
          onnotice: process.env.NODE_ENV === 'test' ? () => {} : undefined,
        }),
    },
    {
      provide: DB,
      inject: [DB_CLIENT],
      useFactory: (client: postgres.Sql) => drizzle(client, { schema }),
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB_CLIENT) private readonly client: postgres.Sql) {}

  // Without this, every e2e spec leaks ~10 idle connections on app.close().
  // Across 12 spec files that adds up past Postgres' default max_connections,
  // and later specs sporadically fail to authenticate ("/api/auth/sign-up/email
  // → 404") once the pool can no longer acquire a backend.
  async onApplicationShutdown(): Promise<void> {
    await this.client.end();
  }
}
