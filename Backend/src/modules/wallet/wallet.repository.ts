import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import {
  bookings,
  rides,
  trips,
  walletHolds,
  wallets,
  walletTransactions,
} from '@core/database/schema';
import type {
  InsertWallet,
  InsertWalletTransaction,
  Wallet,
  WalletTransaction,
} from '@core/database/schema/wallets.schema';
import type {
  InsertWalletHold,
  WalletHold,
} from '@core/database/schema/wallet-holds.schema';
import type {
  PayoutStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from './wallet.types';

@Injectable()
export class WalletRepository {
  /** Locks the wallet row `FOR UPDATE` and returns it, or null if missing. */
  async findByUserIdForUpdate(
    tx: DbClient,
    userId: string,
  ): Promise<Wallet | null> {
    const [row] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .for('update')
      .limit(1);
    return row ?? null;
  }

  async findByUserId(tx: DbClient, userId: string): Promise<Wallet | null> {
    const [row] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);
    return row ?? null;
  }

  async findByConnectAccountId(
    tx: DbClient,
    accountId: string,
  ): Promise<Wallet | null> {
    const [row] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.stripeConnectAccountId, accountId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Idempotent insert. Returns the existing row when the wallet already
   * exists — callers needing the locked row should pair this with
   * `findByUserIdForUpdate`.
   */
  async insertIfMissing(tx: DbClient, row: InsertWallet): Promise<void> {
    await tx.insert(wallets).values(row).onConflictDoNothing();
  }

  async adjustBalance(
    tx: DbClient,
    userId: string,
    deltaCents: number,
  ): Promise<void> {
    await tx
      .update(wallets)
      .set({ balanceCents: sql`${wallets.balanceCents} + ${deltaCents}` })
      .where(eq(wallets.userId, userId));
  }

  async adjustHeld(
    tx: DbClient,
    userId: string,
    deltaCents: number,
  ): Promise<void> {
    await tx
      .update(wallets)
      .set({ heldCents: sql`${wallets.heldCents} + ${deltaCents}` })
      .where(eq(wallets.userId, userId));
  }

  /** Same as adjustBalance + adjustHeld but in one UPDATE. */
  async adjustBalanceAndHeld(
    tx: DbClient,
    userId: string,
    deltas: { balanceDelta: number; heldDelta: number },
  ): Promise<void> {
    await tx
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} + ${deltas.balanceDelta}`,
        heldCents: sql`${wallets.heldCents} + ${deltas.heldDelta}`,
      })
      .where(eq(wallets.userId, userId));
  }

  async setConnectAccount(
    tx: DbClient,
    userId: string,
    accountId: string,
    status: PayoutStatus,
  ): Promise<void> {
    await tx
      .update(wallets)
      .set({ stripeConnectAccountId: accountId, payoutStatus: status })
      .where(eq(wallets.userId, userId));
  }

  async setPayoutStatus(
    tx: DbClient,
    userId: string,
    status: PayoutStatus,
  ): Promise<void> {
    await tx
      .update(wallets)
      .set({ payoutStatus: status })
      .where(eq(wallets.userId, userId));
  }

  // ── wallet_transactions ────────────────────────────────────────────────

  async insertTransaction(
    tx: DbClient,
    row: InsertWalletTransaction,
  ): Promise<WalletTransaction> {
    const [inserted] = await tx
      .insert(walletTransactions)
      .values(row)
      .returning();
    return inserted;
  }

  async findTransactionById(
    tx: DbClient,
    id: string,
  ): Promise<WalletTransaction | null> {
    const [row] = await tx
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.id, id))
      .limit(1);
    return row ?? null;
  }

  async findTransactionByStripeRef(
    tx: DbClient,
    stripeRef: string,
  ): Promise<WalletTransaction | null> {
    const [row] = await tx
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.stripeRef, stripeRef))
      .limit(1);
    return row ?? null;
  }

  /**
   * Conditional flip from `pending` to `target` for a given transaction id.
   * Returns true on a real transition (idempotent: a second call is a
   * no-op).
   */
  async transitionPendingTo(
    tx: DbClient,
    id: string,
    target: WalletTransactionStatus,
    extra: { stripeRef?: string } = {},
  ): Promise<boolean> {
    const updates: Partial<InsertWalletTransaction> = { status: target };
    if (extra.stripeRef !== undefined) {
      updates.stripeRef = extra.stripeRef;
    }
    const updated = await tx
      .update(walletTransactions)
      .set(updates)
      .where(
        and(
          eq(walletTransactions.id, id),
          eq(walletTransactions.status, 'pending'),
        ),
      )
      .returning({ id: walletTransactions.id });
    return updated.length > 0;
  }

  async listTransactions(
    tx: DbClient,
    userId: string,
    params: { limit: number; offset: number },
  ): Promise<WalletTransaction[]> {
    return tx
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, userId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  async countTransactions(tx: DbClient, userId: string): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, userId));
    return row?.count ?? 0;
  }

  /**
   * Used by `GET /me/wallet` to surface the most recent activity inline
   * with the balance — keeps the FE down to one round-trip for the
   * landing view.
   */
  async listRecentTransactions(
    tx: DbClient,
    userId: string,
    limit: number,
  ): Promise<WalletTransaction[]> {
    return this.listTransactions(tx, userId, { limit, offset: 0 });
  }

  /**
   * Marks every Stripe-orphaned top-up `pending → failed`. Not used today
   * but the API surface (and a typed search by type+status) is here for
   * future reconciliation tools. NOTE: kept private-shaped (no public
   * caller) — drop if it stays unused after Phase 6.
   *
   * Caller passes the type filter so the helper can be reused for both
   * top-up and withdrawal reconciliation if/when reconciliation lands.
   */
  async findPendingByType(
    tx: DbClient,
    userId: string,
    type: WalletTransactionType,
  ): Promise<WalletTransaction[]> {
    return tx
      .select()
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletId, userId),
          eq(walletTransactions.type, type),
          eq(walletTransactions.status, 'pending'),
          or(
            isNull(walletTransactions.stripeRef),
            eq(walletTransactions.stripeRef, ''),
          ),
        ),
      );
  }

  // ── wallet_holds ───────────────────────────────────────────────────────

  /**
   * Inserts an `active` hold. The partial-unique index
   * `wallet_holds_booking_active_uq` on `(booking_id) WHERE status='active'`
   * raises a 23505 if a second `active` hold is attempted for the same
   * booking — callers should treat that as a logic error.
   */
  async insertHold(tx: DbClient, row: InsertWalletHold): Promise<WalletHold> {
    const [inserted] = await tx.insert(walletHolds).values(row).returning();
    return inserted;
  }

  /**
   * Finds the (at most one) active hold for a booking. Locks the row
   * `FOR UPDATE` so the caller can flip it without a race.
   */
  async findActiveHoldByBookingForUpdate(
    tx: DbClient,
    bookingId: string,
  ): Promise<WalletHold | null> {
    const [row] = await tx
      .select()
      .from(walletHolds)
      .where(
        and(
          eq(walletHolds.bookingId, bookingId),
          eq(walletHolds.status, 'active'),
        ),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  /**
   * Conditional flip from `active` to `target` for the hold on a booking.
   * Returns true when a row was flipped; false when no active hold exists
   * (callers depend on this for idempotent release/capture paths).
   */
  async transitionActiveHoldTo(
    tx: DbClient,
    bookingId: string,
    target: 'released' | 'captured',
  ): Promise<boolean> {
    const updated = await tx
      .update(walletHolds)
      .set({ status: target })
      .where(
        and(
          eq(walletHolds.bookingId, bookingId),
          eq(walletHolds.status, 'active'),
        ),
      )
      .returning({ id: walletHolds.id });
    return updated.length > 0;
  }

  /**
   * Resolves the driver user id for a booking by joining
   * booking → ride → trip. Returns null if the booking does not exist
   * (the FK on `wallet_holds.booking_id` makes the join always succeed
   * for a known hold, but defensive).
   */
  async findDriverIdForBooking(
    tx: DbClient,
    bookingId: string,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ driverId: trips.driverId })
      .from(bookings)
      .innerJoin(rides, eq(bookings.rideId, rides.id))
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);
    return row?.driverId ?? null;
  }

  /** Returns the ride id of a booking, or null if the booking is gone. */
  async findRideIdForBooking(
    tx: DbClient,
    bookingId: string,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ rideId: bookings.rideId })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    return row?.rideId ?? null;
  }

  /**
   * Rides-sweep cron query #3 — "orphan-hold backstop": `wallet_holds`
   * rows still `active` while their booking is in a terminal state
   * (`cancelled` / `rejected` / `expired`). A hit indicates a missed
   * cancellation seam upstream — the cron releases the hold and logs an
   * error so the bug surfaces.
   */
  async findActiveHoldsOnTerminalBookings(
    tx: DbClient,
  ): Promise<{ holdId: string; bookingId: string }[]> {
    return tx
      .select({ holdId: walletHolds.id, bookingId: walletHolds.bookingId })
      .from(walletHolds)
      .innerJoin(bookings, eq(walletHolds.bookingId, bookings.id))
      .where(
        and(
          eq(walletHolds.status, 'active'),
          sql`${bookings.status} IN ('cancelled', 'rejected', 'expired')`,
        ),
      );
  }
}
