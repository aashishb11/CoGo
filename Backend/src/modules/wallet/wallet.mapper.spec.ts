import type {
  Wallet,
  WalletTransaction,
} from '@core/database/schema/wallets.schema';
import { toWalletResponse, toWalletTransactionDto } from './wallet.mapper';

const mkWallet = (over: Partial<Wallet> = {}): Wallet => ({
  userId: 'u1',
  balanceCents: 0,
  heldCents: 0,
  stripeConnectAccountId: null,
  payoutStatus: 'none',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...over,
});

const mkTx = (over: Partial<WalletTransaction> = {}): WalletTransaction => ({
  id: 'wtx_1',
  walletId: 'u1',
  type: 'topup',
  status: 'completed',
  amountCents: 2000,
  bookingId: null,
  rideId: null,
  stripeRef: null,
  description: null,
  createdAt: new Date('2026-05-24T10:00:00.000Z'),
  updatedAt: new Date('2026-05-24T10:01:00.000Z'),
  ...over,
});

describe('toWalletTransactionDto', () => {
  it('maps every public ledger field including signed amount', () => {
    const tx = mkTx({
      id: 'wtx_42',
      type: 'payment',
      status: 'completed',
      amountCents: -500,
      bookingId: 'bk_1',
      rideId: 'ride_1',
      description: 'Seat charge',
    });

    const dto = toWalletTransactionDto(tx);

    expect(dto).toEqual({
      id: 'wtx_42',
      type: 'payment',
      status: 'completed',
      amountCents: -500,
      description: 'Seat charge',
      bookingId: 'bk_1',
      rideId: 'ride_1',
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    });
  });

  it('keeps nullable description, bookingId, and rideId as null', () => {
    const dto = toWalletTransactionDto(
      mkTx({ description: null, bookingId: null, rideId: null }),
    );

    expect(dto.description).toBeNull();
    expect(dto.bookingId).toBeNull();
    expect(dto.rideId).toBeNull();
  });

  it('omits the internal stripeRef and walletId from the response', () => {
    const dto = toWalletTransactionDto(mkTx({ stripeRef: 'pi_abc' }));

    expect(dto).not.toHaveProperty('stripeRef');
    expect(dto).not.toHaveProperty('walletId');
  });
});

describe('toWalletResponse', () => {
  it('computes availableCents as balanceCents minus heldCents', () => {
    const response = toWalletResponse(
      mkWallet({ balanceCents: 2000, heldCents: 500 }),
      [],
    );

    expect(response.balanceCents).toBe(2000);
    expect(response.heldCents).toBe(500);
    expect(response.availableCents).toBe(1500);
  });

  it('returns availableCents 0 when all funds are reserved', () => {
    const response = toWalletResponse(
      mkWallet({ balanceCents: 1000, heldCents: 1000 }),
      [],
    );

    expect(response.availableCents).toBe(0);
  });

  it('maps recent transactions through the transaction mapper preserving order', () => {
    const t1 = mkTx({ id: 'wtx_1', amountCents: 2000 });
    const t2 = mkTx({ id: 'wtx_2', amountCents: -500, type: 'payment' });
    const response = toWalletResponse(mkWallet({ balanceCents: 1500 }), [
      t1,
      t2,
    ]);

    expect(response.recentTransactions).toHaveLength(2);
    expect(response.recentTransactions[0].id).toBe('wtx_1');
    expect(response.recentTransactions[1].id).toBe('wtx_2');
  });

  it('returns an empty recentTransactions array when none are provided', () => {
    const response = toWalletResponse(mkWallet(), []);

    expect(response.recentTransactions).toEqual([]);
  });

  it('forwards the persisted payoutStatus verbatim', () => {
    const response = toWalletResponse(mkWallet({ payoutStatus: 'active' }), []);

    expect(response.payoutStatus).toBe('active');
  });
});
