// Wallet-module type tuples. Source of truth for the DB `.$type<…>()` and
// every DTO that surfaces a wallet status; both derive from here so the
// strings can never drift.

// `payment` and `earning` are the captured-hold pair (passenger debit +
// driver credit) — not produced in P1+P2 but the column type is fixed in
// the same migration so later phases don't need a schema change.
export const WALLET_TRANSACTION_TYPES = [
  'topup',
  'withdrawal',
  'payment',
  'earning',
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const WALLET_TRANSACTION_STATUSES = [
  'pending',
  'completed',
  'failed',
] as const;
export type WalletTransactionStatus =
  (typeof WALLET_TRANSACTION_STATUSES)[number];

// Active reservations against `wallets.held_cents`. `active` is the only
// non-terminal state; an active hold either flips to `released` (passenger
// or cascade cancellation, refund override at completion) or `captured`
// (boarding scan, no-show capture at completion).
export const WALLET_HOLD_STATUSES = ['active', 'released', 'captured'] as const;
export type WalletHoldStatus = (typeof WALLET_HOLD_STATUSES)[number];

// Connect Express readiness lifecycle. `none` is the implicit default for a
// wallet without a connected account; `pending` is set when the account is
// created but onboarding isn't done, `active` when payouts_enabled flips on,
// `restricted` when Stripe disables a previously-active account.
export const PAYOUT_STATUSES = [
  'none',
  'pending',
  'active',
  'restricted',
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

// Top-up bounds (inclusive) from the epic AC: 1 € – 500 €.
export const TOPUP_MIN_CENTS = 100;
export const TOPUP_MAX_CENTS = 50000;
