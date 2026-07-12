import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { IncidentCategory } from '@modules/safety/safety.types';
import { user } from './auth.schema';
import { rides } from './rides.schema';

// One row per submitted incident. Reads are scoped to "incidents I
// reported" (`GET /me/incidents`) and to the email-assembly join inside
// the safety module; no cross-user read path. Indexed on
// (reporter_id, created_at desc) to serve the personal list view.
export const safetyIncidents = pgTable(
  'safety_incidents',
  {
    id: text('id').primaryKey(),
    rideId: text('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'restrict' }),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    category: text('category').$type<IncidentCategory>().notNull(),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('safety_incidents_reporter_created_idx').on(
      table.reporterId,
      table.createdAt.desc(),
    ),
  ],
);

export const safetyIncidentsRelations = relations(
  safetyIncidents,
  ({ one }) => ({
    ride: one(rides, {
      fields: [safetyIncidents.rideId],
      references: [rides.id],
    }),
    reporter: one(user, {
      fields: [safetyIncidents.reporterId],
      references: [user.id],
    }),
  }),
);

export type SafetyIncident = typeof safetyIncidents.$inferSelect;
export type InsertSafetyIncident = typeof safetyIncidents.$inferInsert;
