import type {
  Wallet,
  WalletTransaction,
} from '@core/database/schema/wallets.schema';
import type {
  WalletResponseDto,
  WalletTransactionDto,
} from './dto/wallet-response.dto';

export const toWalletTransactionDto = (
  row: WalletTransaction,
): WalletTransactionDto => ({
  id: row.id,
  type: row.type,
  status: row.status,
  amountCents: row.amountCents,
  description: row.description ?? null,
  bookingId: row.bookingId ?? null,
  rideId: row.rideId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toWalletResponse = (
  wallet: Wallet,
  recent: WalletTransaction[],
): WalletResponseDto => ({
  balanceCents: wallet.balanceCents,
  heldCents: wallet.heldCents,
  availableCents: wallet.balanceCents - wallet.heldCents,
  payoutStatus: wallet.payoutStatus,
  recentTransactions: recent.map(toWalletTransactionDto),
});
