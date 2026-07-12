import { relations } from 'drizzle-orm';
import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { trips } from './trips.schema';

export const userFavoriteTrips = pgTable(
  'user_favorite_trips',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tripId] })],
);

export const userFavoriteTripsRelations = relations(
  userFavoriteTrips,
  ({ one }) => ({
    user: one(user, {
      fields: [userFavoriteTrips.userId],
      references: [user.id],
    }),
    trip: one(trips, {
      fields: [userFavoriteTrips.tripId],
      references: [trips.id],
    }),
  }),
);

export type UserFavoriteTrip = typeof userFavoriteTrips.$inferSelect;
