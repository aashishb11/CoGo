import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PAYOUT_STATUSES,
  WALLET_TRANSACTION_STATUSES,
  WALLET_TRANSACTION_TYPES,
  type PayoutStatus,
  type WalletTransactionStatus,
  type WalletTransactionType,
} from '../wallet.types';

export class WalletTransactionDto {
  @ApiProperty({ example: 'wtx_01HXYZ…' })
  id!: string;

  @ApiProperty({ enum: WALLET_TRANSACTION_TYPES, example: 'topup' })
  type!: WalletTransactionType;

  @ApiProperty({ enum: WALLET_TRANSACTION_STATUSES, example: 'completed' })
  status!: WalletTransactionStatus;

  @ApiProperty({
    description:
      'Signed amount in cents — positive for credits (top-up, earning), negative for debits (withdrawal, payment).',
    example: 2000,
  })
  amountCents!: number;

  @ApiPropertyOptional({ example: null, nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  bookingId!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  rideId!: string | null;

  @ApiProperty({ example: '2026-05-24T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-05-24T10:01:00.000Z' })
  updatedAt!: Date;
}

export class WalletResponseDto {
  @ApiProperty({
    description: 'Total credit including any reserved holds.',
    example: 2000,
  })
  balanceCents!: number;

  @ApiProperty({
    description:
      'Cents reserved against active bookings. Always 0 until Phase 5 (boarding & holds) wires holds.',
    example: 0,
  })
  heldCents!: number;

  @ApiProperty({
    description:
      'Available = balanceCents - heldCents. Pre-computed for the FE.',
    example: 2000,
  })
  availableCents!: number;

  @ApiProperty({ enum: PAYOUT_STATUSES, example: 'none' })
  payoutStatus!: PayoutStatus;

  @ApiProperty({
    description:
      'Most-recent transactions (≤ 5), newest first. Use GET /me/wallet/transactions for the full paginated history.',
    type: () => WalletTransactionDto,
    isArray: true,
  })
  recentTransactions!: WalletTransactionDto[];
}

export class WalletTransactionListResponseDto {
  @ApiProperty({ type: () => WalletTransactionDto, isArray: true })
  items!: WalletTransactionDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  total!: number;
}

export class CreateTopupResponseDto {
  @ApiProperty({ example: 'wtx_01HXYZ…' })
  transactionId!: string;

  @ApiProperty({
    description:
      'Stripe-hosted Checkout URL. Frontend opens this in a webview / external browser; Stripe bounces back to WALLET_RETURN_URL when done.',
    example: 'https://checkout.stripe.com/c/pay/cs_test_…',
  })
  checkoutUrl!: string;
}

export class PayoutAccountResponseDto {
  @ApiProperty({ enum: PAYOUT_STATUSES, example: 'none' })
  status!: PayoutStatus;
}

export class StartPayoutOnboardingResponseDto {
  @ApiProperty({
    description: 'Stripe Connect Express onboarding link (single-use).',
    example: 'https://connect.stripe.com/setup/e/acct_…/_…',
  })
  onboardingUrl!: string;
}

export class CreateWithdrawalResponseDto {
  @ApiProperty({ example: 'wtx_01HXYZ…' })
  transactionId!: string;

  @ApiProperty({
    enum: ['completed', 'pending', 'failed'],
    description:
      'Outcome of the three-step transfer flow. `completed` = Stripe accepted, ledger settled. `pending` = the transfer call hit a network/5xx; the Connect webhook (`payout.failed` / `transfer.created`) will reconcile. `failed` = Stripe rejected (4xx) and the balance has been credited back.',
    example: 'completed',
  })
  status!: 'completed' | 'pending' | 'failed';
}
