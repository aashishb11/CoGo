import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { BookingStatus } from '@modules/trips/trips.types';
import { user } from './auth.schema';
import { rides } from './rides.schema';

export const bookings = pgTable(
  'bookings',
  {
    id: text('id').primaryKey(),
    passengerId: text('passenger_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rideId: text('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'restrict' }),
    status: text('status').$type<BookingStatus>().default('pending').notNull(),
    message: text('message'),
    // Copy of `trips.price_per_seat_cents` taken when the booking is
    // accepted. Frozen for the lifetime of the booking; later edits to the
    // parent trip's price do not affect already-accepted bookings.
    fareCents: integer('fare_cents'),
    requestedAt: timestamp('requested_at').defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at'),
    rejectedAt: timestamp('rejected_at'),
    cancelledAt: timestamp('cancelled_at'),
    // Authoritative boarding signal; `booking.status` does NOT change at
    // boarding. Code reading "did this passenger board?" checks
    // `boarded_at IS NOT NULL`.
    boardedAt: timestamp('boarded_at'),
  },
  (table) => [
    index('bookings_passenger_requested_idx').on(
      table.passengerId,
      table.requestedAt,
    ),
    index('bookings_ride_status_idx').on(table.rideId, table.status),
    uniqueIndex('bookings_passenger_ride_active_uq')
      .on(table.passengerId, table.rideId)
      .where(sql`status IN ('pending', 'accepted')`),
  ],
);

export const bookingsRelations = relations(bookings, ({ one }) => ({
  passenger: one(user, {
    fields: [bookings.passengerId],
    references: [user.id],
  }),
  ride: one(rides, {
    fields: [bookings.rideId],
    references: [rides.id],
  }),
}));

export type Booking = typeof bookings.$inferSelect;
