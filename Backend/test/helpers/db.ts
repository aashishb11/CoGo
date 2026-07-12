import { sql } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';

export async function truncateAll(db: DbClient): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      "user_ratings",
      "safety_incidents",
      "wallet_holds",
      "wallet_transactions",
      "wallets",
      "trusted_contacts",
      "bookings",
      "rides",
      "user_favorite_trips",
      "trips",
      "cars",
      "car_models",
      "profile",
      "session",
      "account",
      "verification",
      "user",
      "organizations"
    RESTART IDENTITY CASCADE
  `);
}
