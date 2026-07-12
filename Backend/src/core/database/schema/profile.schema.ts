import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export interface ProfileBadge {
  id: string;
  awardedAt: string; // ISO-8601
}

export const profile = pgTable('profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  username: text('username').notNull().unique(),
  bio: text('bio'),
  phone: text('phone'),
  locale: text('locale'),
  totalCo2Saved: doublePrecision('total_co2_saved').notNull().default(0),
  xpPoints: integer('xp_points').notNull().default(0),
  ridesAsDriver: integer('rides_as_driver').notNull().default(0),
  ridesAsPassenger: integer('rides_as_passenger').notNull().default(0),
  badges: jsonb('badges').$type<ProfileBadge[]>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const profileRelations = relations(profile, ({ one }) => ({
  user: one(user, {
    fields: [profile.userId],
    references: [user.id],
  }),
}));

export type Profile = typeof profile.$inferSelect;
