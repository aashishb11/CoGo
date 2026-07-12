/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import type { DbClient } from '@core/database/database.module';
import type { Wallet } from '@core/database/schema/wallets.schema';
import type { StripeService } from '@integrations/stripe/stripe.service';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';

const mkWallet = (over: Partial<Wallet> = {}): Wallet => ({
  userId: 'u1',
  balanceCents: 0,
  heldCents: 0,
  stripeConnectAccountId: null,
  payoutStatus: 'none',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('WalletService.createWithdrawal (three-step flow)', () => {
  let walletsRepo: jest.Mocked<WalletRepository>;
  let stripe: jest.Mocked<StripeService>;
  let txCount: number;
  let db: {
    transaction: jest.Mock;
  };

  // Capture the order in which the wallet was mutated so a test can
  // assert "no DB tx held across Stripe call".
  let events: string[];

  const captureEvent = (label: string) => events.push(label);

  beforeEach(() => {
    txCount = 0;
    events = [];
    walletsRepo = {
      findByUserIdForUpdate: jest.fn(),
      findByUserId: jest.fn(),
      findByConnectAccountId: jest.fn(),
      insertIfMissing: jest.fn(),
      adjustBalance: jest.fn(),
      adjustHeld: jest.fn(),
      adjustBalanceAndHeld: jest.fn(),
      setConnectAccount: jest.fn(),
      setPayoutStatus: jest.fn(),
      insertTransaction: jest.fn(),
      findTransactionById: jest.fn(),
      findTransactionByStripeRef: jest.fn(),
      transitionPendingTo: jest.fn(),
      listTransactions: jest.fn(),
      countTransactions: jest.fn(),
      listRecentTransactions: jest.fn(),
      findPendingByType: jest.fn(),
      insertHold: jest.fn(),
      findActiveHoldByBookingForUpdate: jest.fn(),
      transitionActiveHoldTo: jest.fn(),
      findDriverIdForBooking: jest.fn(),
      findRideIdForBooking: jest.fn(),
    } as unknown as jest.Mocked<WalletRepository>;

    stripe = {
      createTransfer: jest.fn(),
      createTopupCheckoutSession: jest.fn(),
      createConnectExpressAccount: jest.fn(),
      createConnectAccountLink: jest.fn(),
      retrieveAccount: jest.fn(),
      constructPaymentsEvent: jest.fn(),
      constructConnectEvent: jest.fn(),
    } as unknown as jest.Mocked<StripeService>;

    db = {
      transaction: jest.fn(async (fn: (tx: DbClient) => Promise<unknown>) => {
        const label = `tx${++txCount}`;
        captureEvent(`${label}:begin`);
        const result = await fn({} as DbClient);
        captureEvent(`${label}:commit`);
        return result;
      }),
    };
  });

  const makeService = () => {
    const svc = new WalletService(db as never, walletsRepo, stripe);
    // Silence the logger so failure paths don't pollute the test output.
    Object.assign(svc, { logger: new Logger('WalletService.spec') });
    return svc;
  };

  const stubTopupOrWithdrawal = (
    type: 'topup' | 'withdrawal',
    amountCents: number,
  ) => {
    walletsRepo.findTransactionById.mockImplementation((_tx, id) =>
      Promise.resolve({
        id,
        walletId: 'u1',
        type,
        status: 'pending',
        amountCents,
        bookingId: null,
        rideId: null,
        stripeRef: null,
        description: 'Wallet withdrawal',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  };

  it('commits the reserve transaction BEFORE calling Stripe and opens a second tx for settlement', async () => {
    walletsRepo.findByUserIdForUpdate.mockResolvedValueOnce(
      mkWallet({
        balanceCents: 1000,
        heldCents: 0,
        payoutStatus: 'active',
        stripeConnectAccountId: 'acct_1',
      }),
    );
    walletsRepo.transitionPendingTo.mockResolvedValueOnce(true);
    stubTopupOrWithdrawal('withdrawal', -500);
    stripe.createTransfer.mockImplementation(() => {
      captureEvent('stripe:call');
      return Promise.resolve({ id: 'tr_1' } as Stripe.Transfer);
    });

    const svc = makeService();
    const result = await svc.createWithdrawal('u1', 500);

    expect(result.status).toBe('completed');
    expect(stripe.createTransfer).toHaveBeenCalledWith({
      withdrawalId: result.transactionId,
      amountCents: 500,
      destinationAccountId: 'acct_1',
    });
    // The Stripe call must land BETWEEN tx1:commit and tx2:begin.
    expect(events).toEqual([
      'tx1:begin',
      'tx1:commit',
      'stripe:call',
      'tx2:begin',
      'tx2:commit',
    ]);
    // Tx 1 inserts the row, decrements the balance. Tx 2 flips to
    // completed (no balance touch).
    expect(walletsRepo.insertTransaction).toHaveBeenCalledTimes(1);
    expect(walletsRepo.adjustBalance).toHaveBeenCalledTimes(1);
    expect(walletsRepo.adjustBalance).toHaveBeenCalledWith({}, 'u1', -500);
    expect(walletsRepo.transitionPendingTo).toHaveBeenCalledWith(
      {},
      result.transactionId,
      'completed',
      { stripeRef: 'tr_1' },
    );
  });

  it('reverses the reservation when Stripe returns a 4xx', async () => {
    walletsRepo.findByUserIdForUpdate.mockResolvedValue(
      mkWallet({
        balanceCents: 1000,
        heldCents: 0,
        payoutStatus: 'active',
        stripeConnectAccountId: 'acct_1',
      }),
    );
    walletsRepo.transitionPendingTo.mockResolvedValue(true);
    stubTopupOrWithdrawal('withdrawal', -500);
    const stripeErr = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'Insufficient funds in platform account',
    });
    Object.assign(stripeErr, { statusCode: 400 });
    stripe.createTransfer.mockRejectedValueOnce(stripeErr);

    const svc = makeService();
    const result = await svc.createWithdrawal('u1', 500);

    expect(result.status).toBe('failed');
    expect(walletsRepo.adjustBalance).toHaveBeenNthCalledWith(
      1,
      {},
      'u1',
      -500,
    );
    expect(walletsRepo.adjustBalance).toHaveBeenNthCalledWith(2, {}, 'u1', 500);
    expect(walletsRepo.transitionPendingTo).toHaveBeenLastCalledWith(
      {},
      result.transactionId,
      'failed',
      {},
    );
  });

  it('leaves the withdrawal pending on a Stripe network error so the webhook can reconcile', async () => {
    walletsRepo.findByUserIdForUpdate.mockResolvedValue(
      mkWallet({
        balanceCents: 1000,
        heldCents: 0,
        payoutStatus: 'active',
        stripeConnectAccountId: 'acct_1',
      }),
    );
    walletsRepo.transitionPendingTo.mockResolvedValue(true);
    const connErr = new Stripe.errors.StripeConnectionError({
      type: 'StripeConnectionError' as 'api_error',
      message: 'Connection reset',
    });
    stripe.createTransfer.mockRejectedValueOnce(connErr);

    const svc = makeService();
    const result = await svc.createWithdrawal('u1', 500);

    expect(result.status).toBe('pending');
    // Only the reserve happened — no settle, no reverse.
    expect(walletsRepo.adjustBalance).toHaveBeenCalledTimes(1);
    expect(walletsRepo.transitionPendingTo).not.toHaveBeenCalled();
  });

  it('rejects when available balance is below the requested amount', async () => {
    walletsRepo.findByUserIdForUpdate.mockResolvedValueOnce(
      mkWallet({
        balanceCents: 300,
        heldCents: 0,
        payoutStatus: 'active',
        stripeConnectAccountId: 'acct_1',
      }),
    );

    const svc = makeService();
    await expect(svc.createWithdrawal('u1', 500)).rejects.toThrow(
      /INSUFFICIENT_WALLET_BALANCE|exceeds available/,
    );
    expect(stripe.createTransfer).not.toHaveBeenCalled();
  });

  it('rejects when payout account is not active', async () => {
    walletsRepo.findByUserIdForUpdate.mockResolvedValueOnce(
      mkWallet({
        balanceCents: 1000,
        heldCents: 0,
        payoutStatus: 'pending',
        stripeConnectAccountId: 'acct_1',
      }),
    );

    const svc = makeService();
    await expect(svc.createWithdrawal('u1', 500)).rejects.toThrow(
      /PAYOUT_ACCOUNT_NOT_READY|onboarding/,
    );
    expect(stripe.createTransfer).not.toHaveBeenCalled();
  });
});

describe('WalletService.creditTopup', () => {
  it('is idempotent when the row is already non-pending', async () => {
    const walletsRepo = {
      findTransactionById: jest.fn().mockResolvedValue({
        id: 'tx_1',
        walletId: 'u1',
        type: 'topup',
        status: 'completed',
        amountCents: 1000,
        bookingId: null,
        rideId: null,
        stripeRef: 'cs_x',
        description: 'Wallet top-up',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findByUserIdForUpdate: jest
        .fn()
        .mockResolvedValue(mkWallet({ userId: 'u1' })),
      transitionPendingTo: jest.fn().mockResolvedValue(false),
      adjustBalance: jest.fn(),
    } as unknown as jest.Mocked<WalletRepository>;

    const svc = new WalletService(
      {} as never,
      walletsRepo,
      {} as jest.Mocked<StripeService>,
    );
    const result = await svc.creditTopup({} as DbClient, {
      transactionId: 'tx_1',
      stripeRef: 'cs_x',
    });
    expect(result.applied).toBe(false);
    expect(walletsRepo.adjustBalance).not.toHaveBeenCalled();
  });

  it('credits the balance on first delivery', async () => {
    const walletsRepo = {
      findTransactionById: jest.fn().mockResolvedValue({
        id: 'tx_1',
        walletId: 'u1',
        type: 'topup',
        status: 'pending',
        amountCents: 1000,
        bookingId: null,
        rideId: null,
        stripeRef: null,
        description: 'Wallet top-up',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findByUserIdForUpdate: jest
        .fn()
        .mockResolvedValue(mkWallet({ userId: 'u1' })),
      transitionPendingTo: jest.fn().mockResolvedValue(true),
      adjustBalance: jest.fn(),
    } as unknown as jest.Mocked<WalletRepository>;

    const svc = new WalletService(
      {} as never,
      walletsRepo,
      {} as jest.Mocked<StripeService>,
    );
    const result = await svc.creditTopup({} as DbClient, {
      transactionId: 'tx_1',
      stripeRef: 'cs_x',
    });
    expect(result.applied).toBe(true);
    expect(walletsRepo.adjustBalance).toHaveBeenCalledWith({}, 'u1', 1000);
  });
});

describe('WalletService hold primitives', () => {
  const mkWallet = (over: Partial<Wallet> = {}): Wallet => ({
    userId: 'u1',
    balanceCents: 0,
    heldCents: 0,
    stripeConnectAccountId: null,
    payoutStatus: 'none',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  type RepoMock = jest.Mocked<WalletRepository>;
  const makeRepo = (): RepoMock =>
    ({
      findByUserIdForUpdate: jest.fn(),
      findByUserId: jest.fn(),
      findByConnectAccountId: jest.fn(),
      insertIfMissing: jest.fn(),
      adjustBalance: jest.fn(),
      adjustHeld: jest.fn(),
      adjustBalanceAndHeld: jest.fn(),
      setConnectAccount: jest.fn(),
      setPayoutStatus: jest.fn(),
      insertTransaction: jest.fn(),
      findTransactionById: jest.fn(),
      findTransactionByStripeRef: jest.fn(),
      transitionPendingTo: jest.fn(),
      listTransactions: jest.fn(),
      countTransactions: jest.fn(),
      listRecentTransactions: jest.fn(),
      findPendingByType: jest.fn(),
      insertHold: jest.fn(),
      findActiveHoldByBookingForUpdate: jest.fn(),
      transitionActiveHoldTo: jest.fn(),
      findDriverIdForBooking: jest.fn(),
      findRideIdForBooking: jest.fn(),
    }) as unknown as RepoMock;

  const buildService = (walletsRepo: RepoMock) =>
    new WalletService(
      {} as never,
      walletsRepo,
      {} as jest.Mocked<StripeService>,
    );

  describe('placeHold', () => {
    it('lazy-creates the wallet, inserts an active hold, and bumps held_cents', async () => {
      const walletsRepo = makeRepo();
      walletsRepo.findByUserId.mockResolvedValue(mkWallet());
      walletsRepo.findByUserIdForUpdate.mockResolvedValue(mkWallet());
      const svc = buildService(walletsRepo);

      await svc.placeHold({} as DbClient, 'u1', 'bk_1', 500);

      expect(walletsRepo.insertIfMissing).toHaveBeenCalled();
      expect(walletsRepo.findByUserIdForUpdate).toHaveBeenCalledWith({}, 'u1');
      expect(walletsRepo.insertHold).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          walletId: 'u1',
          bookingId: 'bk_1',
          amountCents: 500,
          status: 'active',
        }),
      );
      expect(walletsRepo.adjustHeld).toHaveBeenCalledWith({}, 'u1', 500);
    });

    it('rejects negative or non-integer amounts', async () => {
      const walletsRepo = makeRepo();
      const svc = buildService(walletsRepo);

      await expect(
        svc.placeHold({} as DbClient, 'u1', 'bk_1', -1),
      ).rejects.toThrow();
      await expect(
        svc.placeHold({} as DbClient, 'u1', 'bk_1', 1.5),
      ).rejects.toThrow();
    });
  });

  describe('releaseHold', () => {
    it('is a no-op when no active hold exists for the booking', async () => {
      const walletsRepo = makeRepo();
      walletsRepo.findActiveHoldByBookingForUpdate.mockResolvedValue(null);
      const svc = buildService(walletsRepo);

      const res = await svc.releaseHold({} as DbClient, 'bk_1');

      expect(res.released).toBe(false);
      expect(walletsRepo.transitionActiveHoldTo).not.toHaveBeenCalled();
      expect(walletsRepo.adjustHeld).not.toHaveBeenCalled();
    });

    it('flips active → released and decrements held_cents', async () => {
      const walletsRepo = makeRepo();
      walletsRepo.findActiveHoldByBookingForUpdate.mockResolvedValue({
        id: 'h_1',
        walletId: 'u1',
        bookingId: 'bk_1',
        amountCents: 500,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      walletsRepo.findByUserIdForUpdate.mockResolvedValue(
        mkWallet({ heldCents: 500 }),
      );
      walletsRepo.transitionActiveHoldTo.mockResolvedValue(true);
      const svc = buildService(walletsRepo);

      const res = await svc.releaseHold({} as DbClient, 'bk_1');

      expect(res.released).toBe(true);
      expect(walletsRepo.transitionActiveHoldTo).toHaveBeenCalledWith(
        {},
        'bk_1',
        'released',
      );
      expect(walletsRepo.adjustHeld).toHaveBeenCalledWith({}, 'u1', -500);
    });
  });

  describe('captureHold', () => {
    it('is a no-op when no active hold exists', async () => {
      const walletsRepo = makeRepo();
      walletsRepo.findActiveHoldByBookingForUpdate.mockResolvedValue(null);
      const svc = buildService(walletsRepo);

      const res = await svc.captureHold({} as DbClient, 'bk_1');

      expect(res.captured).toBe(false);
      expect(walletsRepo.adjustBalanceAndHeld).not.toHaveBeenCalled();
      expect(walletsRepo.insertTransaction).not.toHaveBeenCalled();
    });

    it('debits passenger, credits driver, writes ledger pair, flips hold to captured', async () => {
      const walletsRepo = makeRepo();
      walletsRepo.findActiveHoldByBookingForUpdate.mockResolvedValue({
        id: 'h_1',
        walletId: 'u1',
        bookingId: 'bk_1',
        amountCents: 500,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      walletsRepo.findDriverIdForBooking.mockResolvedValue('drv_1');
      walletsRepo.findByUserId.mockResolvedValue(mkWallet({ userId: 'drv_1' }));
      walletsRepo.findByUserIdForUpdate
        .mockResolvedValueOnce(mkWallet({ userId: 'u1', balanceCents: 1000 }))
        .mockResolvedValueOnce(mkWallet({ userId: 'drv_1' }));
      walletsRepo.transitionActiveHoldTo.mockResolvedValue(true);
      const svc = buildService(walletsRepo);

      const res = await svc.captureHold({} as DbClient, 'bk_1');

      expect(res.captured).toBe(true);
      expect(walletsRepo.adjustBalanceAndHeld).toHaveBeenCalledWith({}, 'u1', {
        balanceDelta: -500,
        heldDelta: -500,
      });
      expect(walletsRepo.adjustBalance).toHaveBeenCalledWith({}, 'drv_1', 500);
      // payment row on passenger, earning row on driver.
      expect(walletsRepo.insertTransaction).toHaveBeenCalledTimes(2);
      expect(walletsRepo.insertTransaction).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          walletId: 'u1',
          type: 'payment',
          status: 'completed',
          amountCents: -500,
          bookingId: 'bk_1',
        }),
      );
      expect(walletsRepo.insertTransaction).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          walletId: 'drv_1',
          type: 'earning',
          status: 'completed',
          amountCents: 500,
          bookingId: 'bk_1',
        }),
      );
    });

    it('does not double-charge when transitionActiveHoldTo loses a race', async () => {
      const walletsRepo = makeRepo();
      walletsRepo.findActiveHoldByBookingForUpdate.mockResolvedValue({
        id: 'h_1',
        walletId: 'u1',
        bookingId: 'bk_1',
        amountCents: 500,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      walletsRepo.findDriverIdForBooking.mockResolvedValue('drv_1');
      walletsRepo.findByUserId.mockResolvedValue(mkWallet({ userId: 'drv_1' }));
      walletsRepo.findByUserIdForUpdate.mockResolvedValue(
        mkWallet({ userId: 'u1' }),
      );
      walletsRepo.transitionActiveHoldTo.mockResolvedValue(false);
      const svc = buildService(walletsRepo);

      const res = await svc.captureHold({} as DbClient, 'bk_1');

      expect(res.captured).toBe(false);
      expect(walletsRepo.adjustBalanceAndHeld).not.toHaveBeenCalled();
      expect(walletsRepo.insertTransaction).not.toHaveBeenCalled();
    });
  });
});
