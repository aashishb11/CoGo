import { relations } from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { trips } from './trips.schema';
import { chatMessages } from './chat-messages.schema';

export const chatThreads = pgTable(
  'chat_threads',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'restrict' }),
    passengerId: text('passenger_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // Per-role read cursors for unread-count calculation. Null = never read.
    driverLastReadAt: timestamp('driver_last_read_at'),
    passengerLastReadAt: timestamp('passenger_last_read_at'),
  },
  (table) => [
    uniqueIndex('chat_threads_trip_passenger_uq').on(
      table.tripId,
      table.passengerId,
    ),
    index('chat_threads_trip_id_idx').on(table.tripId),
  ],
);

export const chatThreadsRelations = relations(chatThreads, ({ one, many }) => ({
  trip: one(trips, {
    fields: [chatThreads.tripId],
    references: [trips.id],
  }),
  passenger: one(user, {
    fields: [chatThreads.passengerId],
    references: [user.id],
  }),
  messages: many(chatMessages),
}));

export type ChatThread = typeof chatThreads.$inferSelect;
export type InsertChatThread = typeof chatThreads.$inferInsert;
