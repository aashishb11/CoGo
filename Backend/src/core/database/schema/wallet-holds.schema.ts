import { relations, sql } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { WalletHoldStatus } from '@modules/wallet/wallet.types';
import { bookings } from './bookings.schema';
import { wallets } from './wallets.schema';

// Active reservations against `wallets.held_cents`. Sits separately from
// `wallet_transactions` because a hold is not a realized money movement —
// it becomes one only on capture (`captureHold` writes a payment + earning
// pair). One open hold per booking is enforced by the partial-unique index
// on `(booking_id) WHERE status = 'active'`.
export const walletHolds = pgTable(
  'wallet_holds',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.userId, { onDelete: 'cascade' }),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    // Always positive; sign is implicit (a hold reserves, it doesn't move
    // money).
    amountCents: integer('amount_cents').notNull(),
    status: text('status').$type<WalletHoldStatus>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // At most one `active` hold per booking. Terminal rows (released,
    // captured) are unbounded — a booking can have a captured hold AND a
    // released hold across its history, just never two `active` ones.
    uniqueIndex('wallet_holds_booking_active_uq')
      .on(table.bookingId)
      .where(sql`status = 'active'`),
  ],
);

export const walletHoldsRelations = relations(walletHolds, ({ one }) => ({
  wallet: one(wallets, {
    fields: [walletHolds.walletId],
    references: [wallets.userId],
  }),
  booking: one(bookings, {
    fields: [walletHolds.bookingId],
    references: [bookings.id],
  }),
}));

export type WalletHold = typeof walletHolds.$inferSelect;
export type InsertWalletHold = typeof walletHolds.$inferInsert;
