import type {
  CreatePayoutAccountResponse,
  CreateTopUpResponse,
  CreateWithdrawalResponse,
  PayoutAccountStatusResponse,
  WalletResponseDto,
  WalletTransactionsPage,
} from '@/features/wallet/types';
import { apiFetch } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';

// Backend mounts the wallet routes under `/api/me/wallet/*` (cookie-authed via
// the same better-auth session apiFetch already attaches). Top-up and Connect
// onboarding return a Stripe-hosted URL the app opens in a system browser;
// the backend handles the return via deep links configured in
// CONNECT_RETURN_URL / WALLET_RETURN_URL.
const ENDPOINTS = {
  wallet: '/api/me/wallet',
  transactions: '/api/me/wallet/transactions',
  topUps: '/api/me/wallet/top-ups',
  payoutAccount: '/api/me/wallet/payout-account',
  withdrawals: '/api/me/wallet/withdrawals',
} as const;

export async function getWallet(): Promise<WalletResponseDto> {
  const result = await apiFetch<WalletResponseDto>({
    path: ENDPOINTS.wallet,
    method: 'GET',
  });
  if (!result) {
    // Backend should always return a wallet payload (it auto-provisions on
    // first read). Treat a null payload as an unexpected error.
    throw new ApiError('Wallet response missing', { code: 'WALLET_PAYLOAD_MISSING' });
  }
  return result;
}

export async function listWalletTransactions(
  page: number,
  limit: number,
): Promise<WalletTransactionsPage> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  const result = await apiFetch<WalletTransactionsPage>({
    path: `${ENDPOINTS.transactions}?${params.toString()}`,
    method: 'GET',
  });
  if (!result) {
    return { items: [], page, limit, total: 0 };
  }
  return result;
}

export async function createTopUp(amountCents: number): Promise<CreateTopUpResponse> {
  const result = await apiFetch<CreateTopUpResponse>({
    path: ENDPOINTS.topUps,
    method: 'POST',
    body: { amountCents },
  });
  if (!result) {
    throw new ApiError('Top-up response missing', { code: 'TOPUP_PAYLOAD_MISSING' });
  }
  return result;
}

export async function createPayoutAccount(): Promise<CreatePayoutAccountResponse> {
  const result = await apiFetch<CreatePayoutAccountResponse>({
    path: ENDPOINTS.payoutAccount,
    method: 'POST',
  });
  if (!result) {
    throw new ApiError('Payout-account response missing', { code: 'PAYOUT_PAYLOAD_MISSING' });
  }
  return result;
}

export async function getPayoutAccountStatus(): Promise<PayoutAccountStatusResponse> {
  const result = await apiFetch<PayoutAccountStatusResponse>({
    path: ENDPOINTS.payoutAccount,
    method: 'GET',
  });
  if (!result) {
    return { status: 'none' };
  }
  return result;
}

export async function createWithdrawal(amountCents: number): Promise<CreateWithdrawalResponse> {
  const result = await apiFetch<CreateWithdrawalResponse>({
    path: ENDPOINTS.withdrawals,
    method: 'POST',
    body: { amountCents },
  });
  if (!result) {
    throw new ApiError('Withdrawal response missing', { code: 'WITHDRAWAL_PAYLOAD_MISSING' });
  }
  return result;
}
