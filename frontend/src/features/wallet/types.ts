// Wallet domain DTOs — mirror the backend contract documented in the
// `feat/stripe-wallet-and-payouts` branch on cogo-backend. Amounts are stored
// as signed integer cents: positive = credit to the user's wallet, negative =
// debit. `availableCents` is what the user can withdraw; `heldCents` is the
// reserved-for-bookings amount (always 0 in P1+P2, holds land in a later
// phase).

export type PayoutStatus = 'none' | 'pending' | 'active' | 'restricted';

export type WalletTransactionType = 'topup' | 'withdrawal' | 'payment' | 'earning';

export type WalletTransactionStatus = 'pending' | 'completed' | 'failed';

export type WalletTransactionDto = {
  id: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  amountCents: number;
  description: string | null;
  bookingId: string | null;
  rideId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WalletResponseDto = {
  balanceCents: number;
  heldCents: number;
  availableCents: number;
  payoutStatus: PayoutStatus;
  recentTransactions: WalletTransactionDto[];
};

export type WalletTransactionsPage = {
  items: WalletTransactionDto[];
  page: number;
  limit: number;
  total: number;
};

export type CreateTopUpResponse = {
  transactionId: string;
  checkoutUrl: string;
};

export type CreatePayoutAccountResponse = {
  onboardingUrl: string;
};

export type PayoutAccountStatusResponse = {
  status: PayoutStatus;
};

export type CreateWithdrawalResponse = {
  transactionId: string;
  status: WalletTransactionStatus;
};
