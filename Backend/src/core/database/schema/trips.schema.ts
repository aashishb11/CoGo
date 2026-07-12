import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type {
  ConversationStyle,
  MusicGenre,
  RecurringSchedule,
  TripStatus,
  TripType,
} from '@modules/trips/trips.types';
import type { ExternalEventProvider } from '@shared/external-events/external-event.types';
import { user } from './auth.schema';
import { cars } from './cars.schema';

export const trips = pgTable(
  'trips',
  {
    id: text('id').primaryKey(),
    driverId: text('driver_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    carId: text('car_id')
      .notNull()
      .references(() => cars.id, { onDelete: 'restrict' }),
    type: text('type').$type<TripType>().notNull(),
    status: text('status').$type<TripStatus>().default('active').notNull(),
    originLabel: text('origin_label').notNull(),
    originLat: doublePrecision('origin_lat').notNull(),
    originLng: doublePrecision('origin_lng').notNull(),
    destinationLabel: text('destination_label').notNull(),
    destinationLat: doublePrecision('destination_lat').notNull(),
    destinationLng: doublePrecision('destination_lng').notNull(),
    conversationStyle: text('conversation_style').$type<ConversationStyle>(),
    smokeAllowed: boolean('smoke_allowed').default(false).notNull(),
    musicAllowed: boolean('music_allowed').default(false).notNull(),
    musicGenre: text('music_genre').$type<MusicGenre>(),
    externalEventProvider: text(
      'external_event_provider',
    ).$type<ExternalEventProvider>(),
    externalEventId: text('external_event_id'),
    departureAt: timestamp('departure_at'),
    schedule: jsonb('schedule').$type<RecurringSchedule>(),
    seatsOffered: integer('seats_offered').notNull(),
    // Driver-set per-seat fare in EUR cents. NOT NULL DEFAULT 0; existing
    // rows back-fill to 0 at migration time and drivers set a real price
    // on the next edit.
    pricePerSeatCents: integer('price_per_seat_cents').notNull().default(0),
    totalDistanceKm: doublePrecision('total_distance_km'),
    estimatedDurationMinutes: integer('estimated_duration_minutes'),
    routePolyline: text('route_polyline'),
    cancelledAt: timestamp('cancelled_at'),
    cancellationReason: text('cancellation_reason'),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('trips_driver_id_idx').on(table.driverId),
    index('trips_type_idx').on(table.type),
    index('trips_status_idx').on(table.status),
    index('trips_departure_at_idx').on(table.departureAt),
    index('trips_external_event_idx').on(
      table.externalEventProvider,
      table.externalEventId,
    ),
  ],
);
export const tripsRelations = relations(trips, ({ one }) => ({
  driver: one(user, {
    fields: [trips.driverId],
    references: [user.id],
  }),
  car: one(cars, {
    fields: [trips.carId],
    references: [cars.id],
  }),
}));

export type Trip = typeof trips.$inferSelect;
