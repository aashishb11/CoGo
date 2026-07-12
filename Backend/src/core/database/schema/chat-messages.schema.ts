import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { rides } from './rides.schema';
import { chatThreads } from './chat-threads.schema';

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => chatThreads.id, { onDelete: 'restrict' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rideId: text('ride_id').references(() => rides.id, {
      onDelete: 'restrict',
    }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    deletedByUserId: text('deleted_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('chat_messages_thread_created_idx').on(
      table.threadId,
      table.createdAt,
    ),
    index('chat_messages_sender_created_idx').on(
      table.senderId,
      table.createdAt,
    ),
  ],
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  thread: one(chatThreads, {
    fields: [chatMessages.threadId],
    references: [chatThreads.id],
  }),
  sender: one(user, {
    fields: [chatMessages.senderId],
    references: [user.id],
  }),
  ride: one(rides, {
    fields: [chatMessages.rideId],
    references: [rides.id],
  }),
  deletedBy: one(user, {
    fields: [chatMessages.deletedByUserId],
    references: [user.id],
    relationName: 'deletedBy',
  }),
}));

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;
