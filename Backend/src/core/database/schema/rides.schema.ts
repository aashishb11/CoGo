import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { RideStatus } from '@modules/trips/trips.types';
import { trips } from './trips.schema';

export const rides = pgTable(
  'rides',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'restrict' }),
    scheduledDeparture: timestamp('scheduled_departure').notNull(),
    status: text('status').$type<RideStatus>().default('active').notNull(),
    originLabel: text('origin_label').notNull(),
    originLat: doublePrecision('origin_lat').notNull(),
    originLng: doublePrecision('origin_lng').notNull(),
    destinationLabel: text('destination_label').notNull(),
    destinationLat: doublePrecision('destination_lat').notNull(),
    destinationLng: doublePrecision('destination_lng').notNull(),
    totalDistanceKm: doublePrecision('total_distance_km').notNull(),
    seatsOffered: integer('seats_offered').notNull(),
    seatsOccupied: integer('seats_occupied').default(0).notNull(),
    actualCo2SavedKg: doublePrecision('actual_co2_saved_kg'),
    lastTrafficDelayNotifiedSeconds: integer(
      'last_traffic_delay_notified_seconds',
    ),
    // Set when the driver flips `active → in_progress` via the start-ride
    // endpoint. Used by the rides-sweep cron to detect idle in-progress
    // rides (see docs/plans/2026-05-21-safety-and-payments.md).
    startedAt: timestamp('started_at'),
    // Set by the incidents flow (US-06) so admin / driver UI can surface
    // rides that may need review. Defaults to false; never unset.
    flaggedForReview: boolean('flagged_for_review').notNull().default(false),
    completedAt: timestamp('completed_at'),
    cancelledAt: timestamp('cancelled_at'),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('rides_trip_id_scheduled_departure_idx').on(
      table.tripId,
      table.scheduledDeparture,
    ),
    index('rides_status_scheduled_departure_idx').on(
      table.status,
      table.scheduledDeparture,
    ),
  ],
);

export const ridesRelations = relations(rides, ({ one }) => ({
  trip: one(trips, {
    fields: [rides.tripId],
    references: [trips.id],
  }),
}));

export type Ride = typeof rides.$inferSelect;
export type InsertRide = typeof rides.$inferInsert;
