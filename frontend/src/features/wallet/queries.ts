import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createPayoutAccount,
  createTopUp,
  createWithdrawal,
  getPayoutAccountStatus,
  getWallet,
  listWalletTransactions,
} from '@/features/wallet/api';
import { invalidateAll } from '@/shared/query/invalidation';

const TRANSACTIONS_PAGE_SIZE = 20;

export const queryKeys = {
  wallet: (userId: string) => ['wallet', userId, 'summary'] as const,
  transactions: (userId: string) => ['wallet', userId, 'transactions'] as const,
  payoutStatus: (userId: string) => ['wallet', userId, 'payoutStatus'] as const,
} as const;

export function useWallet(userId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.wallet(userId ?? ''),
    queryFn: () => getWallet(),
    enabled: Boolean(userId),
  });
}

export function usePayoutAccountStatus(userId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.payoutStatus(userId ?? ''),
    queryFn: () => getPayoutAccountStatus(),
    enabled: Boolean(userId),
  });
}

export function useWalletTransactions(userId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.transactions(userId ?? ''),
    enabled: Boolean(userId),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => listWalletTransactions(pageParam, TRANSACTIONS_PAGE_SIZE),
    getNextPageParam: (lastPage) => {
      const totalLoaded = lastPage.page * lastPage.limit;
      if (totalLoaded >= lastPage.total) return undefined;
      return lastPage.page + 1;
    },
  });
}

function invalidateWallet(
  qc: ReturnType<typeof useQueryClient>,
  userId: string | null | undefined,
) {
  if (!userId) return;
  invalidateAll(qc, [
    queryKeys.wallet(userId),
    queryKeys.transactions(userId),
    queryKeys.payoutStatus(userId),
  ]);
}

export function useCreateTopUp(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amountCents: number) => createTopUp(amountCents),
    // We invalidate eagerly so the "pending" top-up row appears on return from
    // Stripe Checkout even before the webhook lands; once the webhook updates
    // the row to `completed`, the next refetch will reflect that.
    onSuccess: () => invalidateWallet(qc, userId),
  });
}

export function useCreatePayoutAccount(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => createPayoutAccount(),
    onSuccess: () => invalidateWallet(qc, userId),
  });
}

export function useCreateWithdrawal(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amountCents: number) => createWithdrawal(amountCents),
    onSuccess: () => invalidateWallet(qc, userId),
  });
}

// Public helper for screens that want to force a wallet refresh — used after
// the user returns from Stripe Checkout / Connect onboarding via the deep
// link, when the mutation that opened the URL has already settled.
export function useInvalidateWallet(userId: string | null | undefined) {
  const qc = useQueryClient();
  return () => invalidateWallet(qc, userId);
}
