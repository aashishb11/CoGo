import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import Stripe from 'stripe';
import { DB, type DbClient } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import type {
  Wallet,
  WalletTransaction,
} from '@core/database/schema/wallets.schema';
import { user as userTable } from '@core/database/schema';
import { eq } from 'drizzle-orm';
import { StripeService } from '@integrations/stripe/stripe.service';
import { throwBadRequest, throwForbidden } from '@shared/errors/throw';
import { WalletRepository } from './wallet.repository';
import {
  PAYOUT_STATUSES,
  TOPUP_MAX_CENTS,
  TOPUP_MIN_CENTS,
  type PayoutStatus,
} from './wallet.types';

export type CreateTopupResult = {
  transactionId: string;
  checkoutUrl: string;
};

export type StartPayoutOnboardingResult = {
  onboardingUrl: string;
};

export type CreateWithdrawalResult = {
  transactionId: string;
  status: 'completed' | 'pending' | 'failed';
};

/**
 * Sole writer of `wallets.balance_cents` / `wallets.held_cents` and the only
 * service that mutates `wallet_transactions`. Every primitive takes `tx`
 * first and locks the affected wallet row `FOR UPDATE` — see the plan's
 * Ledger model section.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly walletsRepo: WalletRepository,
    private readonly stripe: StripeService,
  ) {}

  // ── lazy create ───────────────────────────────────────────────────────

  /**
   * Returns the wallet row for `userId`, creating it on first read.
   * `INSERT … ON CONFLICT DO NOTHING` keeps the call idempotent under
   * concurrent first-touches.
   */
  async getOrCreateWallet(tx: DbClient, userId: string): Promise<Wallet> {
    await this.walletsRepo.insertIfMissing(tx, { userId });
    const wallet = await this.walletsRepo.findByUserId(tx, userId);
    if (!wallet) {
      throw new Error(`Wallet missing after upsert for user ${userId}`);
    }
    return wallet;
  }

  // ── top-ups ───────────────────────────────────────────────────────────

  /**
   * Public entry-point for `POST /me/wallet/top-ups`. Persists a `pending`
   * row, then opens a Stripe Checkout session keyed off that row's id so
   * the webhook can correlate it back. The Checkout call is OUTSIDE the
   * DB transaction so the pool connection isn't held across the round-trip.
   */
  async createTopup(
    userId: string,
    amountCents: number,
    options: { customerEmail?: string } = {},
  ): Promise<CreateTopupResult> {
    if (
      !Number.isInteger(amountCents) ||
      amountCents < TOPUP_MIN_CENTS ||
      amountCents > TOPUP_MAX_CENTS
    ) {
      throwBadRequest(
        'TOPUP_AMOUNT_OUT_OF_RANGE',
        `Top-up amount must be an integer between ${TOPUP_MIN_CENTS} and ${TOPUP_MAX_CENTS} cents`,
        { minCents: TOPUP_MIN_CENTS, maxCents: TOPUP_MAX_CENTS },
      );
    }

    const transactionId = randomUUID();
    const customerEmail = await this.db.transaction(async (tx) => {
      await this.getOrCreateWallet(tx, userId);
      await this.walletsRepo.insertTransaction(tx, {
        id: transactionId,
        walletId: userId,
        type: 'topup',
        status: 'pending',
        amountCents,
        description: 'Wallet top-up',
      });
      return options.customerEmail ?? (await this.lookupEmail(tx, userId));
    });

    const session = await this.stripe.createTopupCheckoutSession({
      transactionId,
      userId,
      amountCents,
      customerEmail,
    });

    if (!session.url) {
      // Stripe returns `url: null` only for embedded mode; we always pass
      // hosted mode so this is genuinely unexpected. Fail loudly rather
      // than handing the FE a row it can't act on.
      throw new Error('Stripe Checkout did not return a hosted URL');
    }

    return { transactionId, checkoutUrl: session.url };
  }

  // ── hold primitives ──────────────────────────────────────────────────
  //
  // `placeHold` / `releaseHold` / `captureHold` are the three transitions
  // a `wallet_holds` row can take (insert as `active`, `active → released`,
  // `active → captured`). Every primitive locks the affected wallet row(s)
  // `FOR UPDATE` and is the sole writer of `balance_cents` / `held_cents`
  // for the lifetime of a booking's hold. See plan §Ledger model.

  /**
   * Reserves `amountCents` from the passenger's wallet against `bookingId`:
   *   - passenger `held += amount`
   *   - insert `wallet_holds` row, status `active`
   *
   * Duplicate calls fail at the partial-unique index — caller must guard.
   * `acceptOne` is the only production caller; it has already validated
   * available funds, but the wallet row is re-locked here for safety.
   */
  async placeHold(
    tx: DbClient,
    passengerUserId: string,
    bookingId: string,
    amountCents: number,
  ): Promise<void> {
    if (!Number.isInteger(amountCents) || amountCents < 0) {
      throw new Error(
        `placeHold called with non-integer/negative amount ${amountCents}`,
      );
    }
    // Lazy-create then lock. createBatch normally bootstraps the wallet,
    // but the accept path is the safety net for any code path that
    // skipped that (e.g. seeded test data, future direct-accept flow).
    await this.getOrCreateWallet(tx, passengerUserId);
    const wallet = await this.walletsRepo.findByUserIdForUpdate(
      tx,
      passengerUserId,
    );
    if (!wallet) {
      throw new Error(`Wallet ${passengerUserId} missing during placeHold`);
    }
    await this.walletsRepo.insertHold(tx, {
      id: randomUUID(),
      walletId: passengerUserId,
      bookingId,
      amountCents,
      status: 'active',
    });
    await this.walletsRepo.adjustHeld(tx, passengerUserId, amountCents);
  }

  /**
   * Releases a booking's active hold:
   *   - passenger `held -= amount`
   *   - hold → `released`
   *
   * No-op when no active hold exists (cancellation paths funnel pending
   * bookings here too — those never went through `placeHold`).
   */
  async releaseHold(
    tx: DbClient,
    bookingId: string,
  ): Promise<{ released: boolean }> {
    const hold = await this.walletsRepo.findActiveHoldByBookingForUpdate(
      tx,
      bookingId,
    );
    if (!hold) {
      return { released: false };
    }
    const wallet = await this.walletsRepo.findByUserIdForUpdate(
      tx,
      hold.walletId,
    );
    if (!wallet) {
      throw new Error(`Wallet ${hold.walletId} missing during releaseHold`);
    }
    const applied = await this.walletsRepo.transitionActiveHoldTo(
      tx,
      bookingId,
      'released',
    );
    if (!applied) {
      // Lost a race with another release/capture in the same window;
      // the row was already terminal by the time we updated.
      return { released: false };
    }
    await this.walletsRepo.adjustHeld(tx, hold.walletId, -hold.amountCents);
    return { released: true };
  }

  /**
   * Captures a booking's active hold:
   *   - passenger `balance -= amount`, `held -= amount`
   *   - driver `balance += amount`
   *   - hold → `captured`
   *   - insert ledger pair (`payment` on passenger, `earning` on driver)
   *
   * No-op when no active hold exists (e.g. completion settling a ride
   * that was already cancelled, or a duplicate scan).
   */
  async captureHold(
    tx: DbClient,
    bookingId: string,
  ): Promise<{ captured: boolean }> {
    const hold = await this.walletsRepo.findActiveHoldByBookingForUpdate(
      tx,
      bookingId,
    );
    if (!hold) {
      return { captured: false };
    }
    const driverUserId = await this.walletsRepo.findDriverIdForBooking(
      tx,
      bookingId,
    );
    if (!driverUserId) {
      throw new Error(
        `captureHold: cannot resolve driver for booking ${bookingId}`,
      );
    }
    // Make sure the driver has a wallet (lazy-create) then lock it.
    await this.getOrCreateWallet(tx, driverUserId);
    // Always lock in a deterministic order to avoid deadlocks: passenger
    // first (by hold.walletId), driver second.
    const passengerWallet = await this.walletsRepo.findByUserIdForUpdate(
      tx,
      hold.walletId,
    );
    if (!passengerWallet) {
      throw new Error(`Wallet ${hold.walletId} missing during captureHold`);
    }
    const driverWallet = await this.walletsRepo.findByUserIdForUpdate(
      tx,
      driverUserId,
    );
    if (!driverWallet) {
      throw new Error(`Wallet ${driverUserId} missing during captureHold`);
    }
    const applied = await this.walletsRepo.transitionActiveHoldTo(
      tx,
      bookingId,
      'captured',
    );
    if (!applied) {
      // Another tx captured/released the same hold first.
      return { captured: false };
    }
    // Pull the ride id off the booking so the ledger rows carry it.
    const rideId = await this.walletsRepo.findRideIdForBooking(tx, bookingId);

    await this.walletsRepo.adjustBalanceAndHeld(tx, hold.walletId, {
      balanceDelta: -hold.amountCents,
      heldDelta: -hold.amountCents,
    });
    await this.walletsRepo.adjustBalance(tx, driverUserId, hold.amountCents);

    await this.walletsRepo.insertTransaction(tx, {
      id: randomUUID(),
      walletId: hold.walletId,
      type: 'payment',
      status: 'completed',
      amountCents: -hold.amountCents,
      bookingId,
      rideId,
      description: 'Seat fare',
    });
    await this.walletsRepo.insertTransaction(tx, {
      id: randomUUID(),
      walletId: driverUserId,
      type: 'earning',
      status: 'completed',
      amountCents: hold.amountCents,
      bookingId,
      rideId,
      description: 'Seat fare',
    });

    return { captured: true };
  }

  // ── ledger primitives ─────────────────────────────────────────────────

  /**
   * Credits a successful top-up. Idempotent: the partial-unique index on
   * `wallet_transactions.stripe_ref` blocks a second call for the same
   * Checkout session, and the `status='pending'` guard in
   * `transitionPendingTo` short-circuits a replay.
   */
  async creditTopup(
    tx: DbClient,
    params: { transactionId: string; stripeRef: string },
  ): Promise<{ applied: boolean }> {
    const row = await this.walletsRepo.findTransactionById(
      tx,
      params.transactionId,
    );
    if (!row) {
      this.logger.warn(
        `creditTopup: transaction ${params.transactionId} not found — skipping`,
      );
      return { applied: false };
    }
    if (row.type !== 'topup') {
      this.logger.error(
        `creditTopup: transaction ${row.id} is type ${row.type}, expected topup`,
      );
      return { applied: false };
    }
    // Lock the wallet row first so a concurrent settle/reverse can't race.
    const wallet = await this.walletsRepo.findByUserIdForUpdate(
      tx,
      row.walletId,
    );
    if (!wallet) {
      throw new Error(`Wallet ${row.walletId} missing during creditTopup`);
    }
    const applied = await this.walletsRepo.transitionPendingTo(
      tx,
      row.id,
      'completed',
      { stripeRef: params.stripeRef },
    );
    if (!applied) {
      return { applied: false };
    }
    await this.walletsRepo.adjustBalance(tx, row.walletId, row.amountCents);
    return { applied: true };
  }

  /** Flips a pending top-up to `failed`. Idempotent. */
  async markTopupFailed(
    tx: DbClient,
    params: { transactionId: string; stripeRef?: string },
  ): Promise<{ applied: boolean }> {
    const row = await this.walletsRepo.findTransactionById(
      tx,
      params.transactionId,
    );
    if (!row || row.type !== 'topup') {
      return { applied: false };
    }
    const applied = await this.walletsRepo.transitionPendingTo(
      tx,
      row.id,
      'failed',
      params.stripeRef ? { stripeRef: params.stripeRef } : {},
    );
    return { applied };
  }

  // ── withdrawals ───────────────────────────────────────────────────────

  /**
   * Three-step withdrawal as locked in the plan:
   *   1. Tx 1 — `reserveWithdrawal`: insert `pending` row + debit balance.
   *   2. `stripe.transfers.create({ idempotencyKey: withdrawalId })` with
   *      no DB transaction held open.
   *   3. Tx 2 — `settleWithdrawal` on success / `reverseWithdrawal` on a
   *      Stripe 4xx. Network/unknown errors leave `pending` for the Connect
   *      webhook to reconcile; the idempotency key keeps a retry safe.
   */
  async createWithdrawal(
    userId: string,
    amountCents: number,
  ): Promise<CreateWithdrawalResult> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throwBadRequest(
        'VALIDATION_FAILED',
        'Withdrawal amount must be a positive integer cents value',
      );
    }

    // ── Tx 1: reserve ──────────────────────────────────────────────────
    const reserved = await this.db.transaction(async (tx) => {
      const wallet = await this.assertActivePayoutAccount(tx, userId);
      if (!wallet.stripeConnectAccountId) {
        // Defensive: assertActivePayoutAccount throws when missing.
        throw new Error('Active payout account missing connect account id');
      }
      const available = wallet.balanceCents - wallet.heldCents;
      if (amountCents > available) {
        throwBadRequest(
          'INSUFFICIENT_WALLET_BALANCE',
          'Withdrawal exceeds available wallet balance',
          {
            availableCents: available,
            shortfallCents: amountCents - available,
          },
        );
      }
      const transactionId = randomUUID();
      await this.walletsRepo.insertTransaction(tx, {
        id: transactionId,
        walletId: userId,
        type: 'withdrawal',
        status: 'pending',
        amountCents: -amountCents,
        description: 'Wallet withdrawal',
      });
      await this.walletsRepo.adjustBalance(tx, userId, -amountCents);
      return {
        transactionId,
        connectAccountId: wallet.stripeConnectAccountId,
      };
    });

    // ── Stripe: no DB transaction held ─────────────────────────────────
    let transferId: string;
    try {
      const transfer = await this.stripe.createTransfer({
        withdrawalId: reserved.transactionId,
        amountCents,
        destinationAccountId: reserved.connectAccountId,
      });
      transferId = transfer.id;
    } catch (err: unknown) {
      if (this.isStripe4xx(err)) {
        // 4xx → settled-failure: refund the balance and mark the row failed.
        await this.db.transaction(async (tx) => {
          await this.reverseWithdrawal(tx, {
            transactionId: reserved.transactionId,
          });
        });
        this.logger.warn(
          `Withdrawal ${reserved.transactionId} reversed after Stripe 4xx: ${this.formatError(err)}`,
        );
        return { transactionId: reserved.transactionId, status: 'failed' };
      }
      // Network/5xx → leave pending; Connect webhook reconciles.
      this.logger.error(
        `Withdrawal ${reserved.transactionId} left pending after Stripe error: ${this.formatError(err)}`,
      );
      return { transactionId: reserved.transactionId, status: 'pending' };
    }

    // ── Tx 2: settle ───────────────────────────────────────────────────
    await this.db.transaction(async (tx) => {
      await this.settleWithdrawal(tx, {
        transactionId: reserved.transactionId,
        stripeRef: transferId,
      });
    });
    return { transactionId: reserved.transactionId, status: 'completed' };
  }

  // `reserveWithdrawal` is described in the plan as the tx-1 primitive
  // (insert + debit). It is inlined in `createWithdrawal` rather than
  // extracted so the two-transaction boundary stays visible at the call
  // site; the corresponding settle/reverse primitives below are the
  // public surface webhook handlers reuse.

  /** Idempotent: flips a pending withdrawal to `completed`. */
  async settleWithdrawal(
    tx: DbClient,
    params: { transactionId: string; stripeRef: string },
  ): Promise<{ applied: boolean }> {
    const row = await this.walletsRepo.findTransactionById(
      tx,
      params.transactionId,
    );
    if (!row || row.type !== 'withdrawal') {
      return { applied: false };
    }
    const applied = await this.walletsRepo.transitionPendingTo(
      tx,
      row.id,
      'completed',
      { stripeRef: params.stripeRef },
    );
    return { applied };
  }

  /**
   * Idempotent: flips a pending withdrawal to `failed` and credits the
   * balance back. Called when Stripe returns 4xx, when the Connect
   * webhook signals `payout.failed`, and (in P5+) when a reservation
   * cascade unwinds.
   */
  async reverseWithdrawal(
    tx: DbClient,
    params: { transactionId: string; stripeRef?: string },
  ): Promise<{ applied: boolean }> {
    const row = await this.walletsRepo.findTransactionById(
      tx,
      params.transactionId,
    );
    if (!row || row.type !== 'withdrawal') {
      return { applied: false };
    }
    // Lock the wallet row before the credit-back.
    const wallet = await this.walletsRepo.findByUserIdForUpdate(
      tx,
      row.walletId,
    );
    if (!wallet) {
      throw new Error(
        `Wallet ${row.walletId} missing during reverseWithdrawal`,
      );
    }
    const applied = await this.walletsRepo.transitionPendingTo(
      tx,
      row.id,
      'failed',
      params.stripeRef ? { stripeRef: params.stripeRef } : {},
    );
    if (!applied) {
      return { applied: false };
    }
    // `amountCents` on a withdrawal is stored negative; subtract it to
    // credit the balance back.
    await this.walletsRepo.adjustBalance(tx, row.walletId, -row.amountCents);
    return { applied: true };
  }

  // ── Connect onboarding ────────────────────────────────────────────────

  async startPayoutOnboarding(
    userId: string,
  ): Promise<StartPayoutOnboardingResult> {
    const email = await this.db.transaction((tx) =>
      this.lookupEmail(tx, userId),
    );
    const wallet = await this.db.transaction((tx) =>
      this.getOrCreateWallet(tx, userId),
    );

    let connectAccountId = wallet.stripeConnectAccountId;
    if (!connectAccountId) {
      const account = await this.stripe.createConnectExpressAccount({
        userId,
        email,
      });
      connectAccountId = account.id;
      await this.db.transaction((tx) =>
        this.walletsRepo.setConnectAccount(
          tx,
          userId,
          connectAccountId!,
          this.deriveStatusFromAccount(account),
        ),
      );
    }

    const link = await this.stripe.createConnectAccountLink(connectAccountId);
    return { onboardingUrl: link.url };
  }

  async getPayoutAccountStatus(
    userId: string,
  ): Promise<{ status: PayoutStatus }> {
    const wallet = await this.db.transaction((tx) =>
      this.getOrCreateWallet(tx, userId),
    );
    if (!wallet.stripeConnectAccountId) {
      return { status: 'none' };
    }
    // Best-effort refresh: pull the latest account state from Stripe so
    // status changes between webhooks are visible (some webhook events
    // can lag). We absorb errors here — the persisted status is the
    // fallback.
    try {
      const account = await this.stripe.retrieveAccount(
        wallet.stripeConnectAccountId,
      );
      const derived = this.deriveStatusFromAccount(account);
      if (derived !== wallet.payoutStatus) {
        await this.db.transaction((tx) =>
          this.walletsRepo.setPayoutStatus(tx, userId, derived),
        );
        return { status: derived };
      }
    } catch (err: unknown) {
      this.logger.warn(
        `Stripe accounts.retrieve failed for ${userId}: ${this.formatError(err)}`,
      );
    }
    return { status: wallet.payoutStatus };
  }

  /**
   * Webhook entry-point for `account.updated`. Idempotent.
   */
  async syncAccountStatus(
    tx: DbClient,
    account: Stripe.Account,
  ): Promise<void> {
    const wallet = await this.walletsRepo.findByConnectAccountId(
      tx,
      account.id,
    );
    if (!wallet) {
      this.logger.warn(
        `account.updated for unknown account ${account.id} — ignoring`,
      );
      return;
    }
    const derived = this.deriveStatusFromAccount(account);
    if (derived !== wallet.payoutStatus) {
      await this.walletsRepo.setPayoutStatus(tx, wallet.userId, derived);
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────

  /**
   * Used by the webhook controller to look up a pending top-up by its
   * Checkout session id (passed through Stripe as `client_reference_id`).
   * The webhook then dispatches to `creditTopup` / `markTopupFailed`.
   */
  async findPendingTopupById(
    tx: DbClient,
    transactionId: string,
  ): Promise<WalletTransaction | null> {
    const row = await this.walletsRepo.findTransactionById(tx, transactionId);
    if (!row || row.type !== 'topup') {
      return null;
    }
    return row;
  }

  // The `processed_stripe_events` route described in the plan would be a
  // separate table; in P1+P2 the surface is small enough that the
  // partial-unique index on `wallet_transactions.stripe_ref` (top-ups)
  // and the `withdrawalId`-as-idempotency-key contract (transfers)
  // collapse webhook idempotency to per-row guards. Document the choice
  // here so a later reviewer doesn't go hunting for the events table.
  // See plan §"Stripe webhook idempotency" for the full reasoning.

  private async assertActivePayoutAccount(
    tx: DbClient,
    userId: string,
  ): Promise<Wallet> {
    const wallet = await this.walletsRepo.findByUserIdForUpdate(tx, userId);
    if (!wallet) {
      // Lazy-create first so the error code is meaningful instead of
      // "wallet not found".
      await this.getOrCreateWallet(tx, userId);
      throwForbidden(
        'PAYOUT_ACCOUNT_NOT_READY',
        'Connect onboarding has not been completed',
      );
    }
    if (wallet.payoutStatus !== 'active' || !wallet.stripeConnectAccountId) {
      throwForbidden(
        'PAYOUT_ACCOUNT_NOT_READY',
        'Connect onboarding has not been completed',
        { status: wallet.payoutStatus },
      );
    }
    return wallet;
  }

  private async lookupEmail(
    tx: DbClient,
    userId: string,
  ): Promise<string | undefined> {
    const [row] = await tx
      .select({ email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);
    return row?.email;
  }

  private deriveStatusFromAccount(account: Stripe.Account): PayoutStatus {
    // Drivers receive money via Transfer only — `createConnectExpressAccount`
    // requests just the `transfers` capability, never `card_payments`, so
    // `charges_enabled` stays false on a healthy account. `payouts_enabled`
    // is the only signal that matters for "can withdraw now".
    if (account.payouts_enabled) {
      return 'active';
    }
    // Stripe stamps `requirements.disabled_reason = 'requirements.past_due'`
    // on a freshly-created account the moment we call accounts.create,
    // before the driver has filled in any of the hosted onboarding form.
    // That state is "pending — finish onboarding", not "restricted".
    if (!account.details_submitted) {
      return 'pending';
    }
    const reason = account.requirements?.disabled_reason ?? '';
    // Post-submission, `requirements.*` reasons mean Stripe is asking for
    // more info or verifying. Surface as pending so the driver can keep
    // resolving it from the onboarding link. Reserve `restricted` for hard
    // blocks (rejected.*, under_review, listed, platform_paused).
    if (reason === '' || reason.startsWith('requirements.')) {
      return 'pending';
    }
    return 'restricted';
  }

  private isStripe4xx(err: unknown): boolean {
    if (!(err instanceof Stripe.errors.StripeError)) {
      return false;
    }
    if (
      err instanceof Stripe.errors.StripeConnectionError ||
      err instanceof Stripe.errors.StripeAPIError
    ) {
      return false;
    }
    const status = err.statusCode;
    return typeof status === 'number' && status >= 400 && status < 500;
  }

  private formatError(err: unknown): string {
    if (err instanceof Error) {
      return `${err.name}: ${err.message}`;
    }
    return String(err);
  }
}

// Re-export the status tuple so tests can import a single canonical
// source without reaching across modules.
export { PAYOUT_STATUSES };
