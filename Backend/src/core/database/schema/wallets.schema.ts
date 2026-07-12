import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  PayoutStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from '@modules/wallet/wallet.types';
import { user } from './auth.schema';

// Each user has at most one wallet. `user_id` is both PK and FK so the 1:1
// relationship is enforced by the schema, mirroring `profile`. Available
// balance = `balance_cents - held_cents`; the denormalised counters follow
// the same pattern as `rides.seats_occupied`.
//
// `stripe_connect_account_id` and `payout_status` are folded into the same
// table from the start even though Connect onboarding is a US-02 concern —
// the plan ships US-01 + US-02 together (see
// docs/plans/2026-05-21-safety-and-payments.md scope override), so a
// single migration is simpler than two against the same row.
export const wallets = pgTable('wallets', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  balanceCents: integer('balance_cents').notNull().default(0),
  heldCents: integer('held_cents').notNull().default(0),
  stripeConnectAccountId: text('stripe_connect_account_id'),
  payoutStatus: text('payout_status')
    .$type<PayoutStatus>()
    .notNull()
    .default('none'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Append-only ledger of realized money movements. Holds live in their own
// table (P5) and never produce a row here until the hold is captured.
export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.userId, { onDelete: 'cascade' }),
    type: text('type').$type<WalletTransactionType>().notNull(),
    status: text('status').$type<WalletTransactionStatus>().notNull(),
    // Signed: positive = credit, negative = debit.
    amountCents: integer('amount_cents').notNull(),
    bookingId: text('booking_id'),
    rideId: text('ride_id'),
    stripeRef: text('stripe_ref'),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('wallet_transactions_wallet_created_idx').on(
      table.walletId,
      table.createdAt.desc(),
    ),
    // Webhook idempotency: when `stripe_ref` is set, no two rows may share
    // it. NULL stripe_refs are allowed in bulk (one ledger row per
    // captured-hold pair has no stripe ref).
    uniqueIndex('wallet_transactions_stripe_ref_uq')
      .on(table.stripeRef)
      .where(sql`${table.stripeRef} is not null`),
  ],
);

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(user, {
    fields: [wallets.userId],
    references: [user.id],
  }),
  transactions: many(walletTransactions),
}));

export const walletTransactionsRelations = relations(
  walletTransactions,
  ({ one }) => ({
    wallet: one(wallets, {
      fields: [walletTransactions.walletId],
      references: [wallets.userId],
    }),
  }),
);

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = typeof walletTransactions.$inferInsert;
