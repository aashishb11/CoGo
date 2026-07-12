import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { rides } from './rides.schema';

// One row per (ride, rater, ratee). Direction is driver ↔ boarded
// passenger only; the rater/ratee predicate lives in the service.
// The unique index is the final backstop against duplicate submits —
// service catches the resulting 23505 and translates to
// RATING_ALREADY_SUBMITTED. The (ratee_id, created_at desc) index
// backs both the profile-summary aggregate and the admin paginated
// list. See docs/plans/2026-05-25-user-ratings.md.
export const userRatings = pgTable(
  'user_ratings',
  {
    id: text('id').primaryKey(),
    rideId: text('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'restrict' }),
    raterId: text('rater_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rateeId: text('ratee_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_ratings_ride_rater_ratee_uq').on(
      table.rideId,
      table.raterId,
      table.rateeId,
    ),
    index('user_ratings_ratee_created_idx').on(
      table.rateeId,
      table.createdAt.desc(),
    ),
    check('user_ratings_score_range_chk', sql`${table.score} BETWEEN 1 AND 5`),
  ],
);

export const userRatingsRelations = relations(userRatings, ({ one }) => ({
  ride: one(rides, {
    fields: [userRatings.rideId],
    references: [rides.id],
  }),
  rater: one(user, {
    fields: [userRatings.raterId],
    references: [user.id],
  }),
  ratee: one(user, {
    fields: [userRatings.rateeId],
    references: [user.id],
  }),
}));

export type UserRating = typeof userRatings.$inferSelect;
export type InsertUserRating = typeof userRatings.$inferInsert;
