import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export interface PushSubscriptionSettings {
  traffic_alerts: boolean;
}

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    keys: jsonb('keys').$type<{ p256dh: string; auth: string }>().notNull(),
    settings: jsonb('settings')
      .$type<PushSubscriptionSettings>()
      .default({ traffic_alerts: true })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('push_subscriptions_user_id_idx').on(table.userId),
    uniqueIndex('push_subscriptions_endpoint_uq').on(table.endpoint),
  ],
);

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ one }) => ({
    user: one(user, {
      fields: [pushSubscriptions.userId],
      references: [user.id],
    }),
  }),
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;
