/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException, HttpException, Logger } from '@nestjs/common';
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

const mkStripeAccount = (over: Partial<Stripe.Account> = {}): Stripe.Account =>
  ({
    id: 'acct_1',
    payouts_enabled: false,
    details_submitted: false,
    requirements: { disabled_reason: 'requirements.past_due' },
    ...over,
  }) as unknown as Stripe.Account;

const expectErrorCode = async (
  promise: Promise<unknown>,
  code: string,
): Promise<void> => {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((err: unknown) => {
    const body = (err as HttpException).getResponse() as { code?: string };
    expect(body.code).toBe(code);
  });
};

// Chainable stub mimicking the Drizzle builder so private `lookupEmail` calls
// resolve cleanly without forcing every test to author the chain.
const makeQueryChain = (rows: { email?: string }[] = []) => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return chain;
};

describe('WalletService — topups, onboarding, and settle/reverse primitives', () => {
  let walletsRepo: jest.Mocked<WalletRepository>;
  let stripe: jest.Mocked<StripeService>;
  let db: { transaction: jest.Mock };
  let txStub: { select: jest.Mock };

  beforeEach(() => {
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

    txStub = { select: jest.fn(() => makeQueryChain([])) };

    db = {
      transaction: jest.fn(async (fn: (tx: DbClient) => Promise<unknown>) =>
        fn(txStub as unknown as DbClient),
      ),
    };
  });

  const makeService = () => {
    const svc = new WalletService(db as never, walletsRepo, stripe);
    Object.assign(svc, { logger: new Logger('WalletService.spec') });
    return svc;
  };

  describe('createTopup', () => {
    it('rejects amounts below the minimum', async () => {
      const svc = makeService();
      await expectErrorCode(
        svc.createTopup('u1', 50),
        'TOPUP_AMOUNT_OUT_OF_RANGE',
      );
      expect(stripe.createTopupCheckoutSession).not.toHaveBeenCalled();
    });

    it('rejects amounts above the maximum', async () => {
      const svc = makeService();
      await expectErrorCode(
        svc.createTopup('u1', 100_000),
        'TOPUP_AMOUNT_OUT_OF_RANGE',
      );
    });

    it('rejects non-integer amounts', async () => {
      const svc = makeService();
      await expectErrorCode(
        svc.createTopup('u1', 100.5),
        'TOPUP_AMOUNT_OUT_OF_RANGE',
      );
    });

    it('persists a pending transaction then opens the Stripe Checkout session', async () => {
      walletsRepo.findByUserId.mockResolvedValue(mkWallet());
      stripe.createTopupCheckoutSession.mockResolvedValueOnce({
        id: 'cs_1',
        url: 'https://stripe.example/checkout',
      } as unknown as Stripe.Checkout.Session);

      const svc = makeService();
      const result = await svc.createTopup('u1', 1000, {
        customerEmail: 'gabi@example.com',
      });

      expect(walletsRepo.insertTransaction).toHaveBeenCalledWith(
        txStub,
        expect.objectContaining({
          walletId: 'u1',
          type: 'topup',
          status: 'pending',
          amountCents: 1000,
        }),
      );
      expect(stripe.createTopupCheckoutSession).toHaveBeenCalledWith({
        transactionId: result.transactionId,
        userId: 'u1',
        amountCents: 1000,
        customerEmail: 'gabi@example.com',
      });
      expect(result.checkoutUrl).toBe('https://stripe.example/checkout');
    });

    it('throws when Stripe returns a Checkout session without a hosted URL', async () => {
      walletsRepo.findByUserId.mockResolvedValue(mkWallet());
      stripe.createTopupCheckoutSession.mockResolvedValueOnce({
        id: 'cs_1',
        url: null,
      } as unknown as Stripe.Checkout.Session);

      const svc = makeService();
      await expect(
        svc.createTopup('u1', 1000, { customerEmail: 'gabi@example.com' }),
      ).rejects.toThrow(/hosted URL/);
    });

    it('looks up the customer email when the caller does not supply one', async () => {
      walletsRepo.findByUserId.mockResolvedValue(mkWallet());
      txStub.select.mockReturnValueOnce(
        makeQueryChain([{ email: 'looked-up@example.com' }]),
      );
      stripe.createTopupCheckoutSession.mockResolvedValueOnce({
        id: 'cs_1',
        url: 'https://stripe.example/checkout',
      } as unknown as Stripe.Checkout.Session);

      const svc = makeService();
      await svc.createTopup('u1', 1000);

      expect(stripe.createTopupCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ customerEmail: 'looked-up@example.com' }),
      );
    });
  });

  describe('markTopupFailed', () => {
    it('returns applied=false when the transaction is missing', async () => {
      walletsRepo.findTransactionById.mockResolvedValueOnce(null);
      const svc = makeService();

      const result = await svc.markTopupFailed({} as DbClient, {
        transactionId: 'tx_missing',
      });

      expect(result.applied).toBe(false);
      expect(walletsRepo.transitionPendingTo).not.toHaveBeenCalled();
    });

    it('returns applied=false when the row is not a topup', async () => {
      walletsRepo.findTransactionById.mockResolvedValueOnce({
        id: 'tx_1',
        type: 'withdrawal',
      } as never);
      const svc = makeService();

      const result = await svc.markTopupFailed({} as DbClient, {
        transactionId: 'tx_1',
      });

      expect(result.applied).toBe(false);
    });

    it('flips a pending topup to failed and stamps the stripe ref when present', async () => {
      walletsRepo.findTransactionById.mockResolvedValueOnce({
        id: 'tx_1',
        type: 'topup',
      } as never);
      walletsRepo.transitionPendingTo.mockResolvedValueOnce(true);
      const svc = makeService();

      const result = await svc.markTopupFailed({} as DbClient, {
        transactionId: 'tx_1',
        stripeRef: 'cs_x',
      });

      expect(result.applied).toBe(true);
      expect(walletsRepo.transitionPendingTo).toHaveBeenCalledWith(
        {},
        'tx_1',
        'failed',
        { stripeRef: 'cs_x' },
      );
    });
  });

  describe('settleWithdrawal', () => {
    it('returns applied=false when the row is missing or wrong type', async () => {
      walletsRepo.findTransactionById.mockResolvedValueOnce(null);
      const svc = makeService();

      const result = await svc.settleWithdrawal({} as DbClient, {
        transactionId: 'tx_x',
        stripeRef: 'tr_1',
      });

      expect(result.applied).toBe(false);
      expect(walletsRepo.transitionPendingTo).not.toHaveBeenCalled();
    });

    it('flips a pending withdrawal to completed and stamps the stripe ref', async () => {
      walletsRepo.findTransactionById.mockResolvedValueOnce({
        id: 'tx_1',
        type: 'withdrawal',
      } as never);
      walletsRepo.transitionPendingTo.mockResolvedValueOnce(true);
      const svc = makeService();

      const result = await svc.settleWithdrawal({} as DbClient, {
        transactionId: 'tx_1',
        stripeRef: 'tr_1',
      });

      expect(result.applied).toBe(true);
      expect(walletsRepo.transitionPendingTo).toHaveBeenCalledWith(
        {},
        'tx_1',
        'completed',
        { stripeRef: 'tr_1' },
      );
    });
  });

  describe('reverseWithdrawal', () => {
    it('returns applied=false when the row is missing', async () => {
      walletsRepo.findTransactionById.mockResolvedValueOnce(null);
      const svc = makeService();

      const result = await svc.reverseWithdrawal({} as DbClient, {
        transactionId: 'tx_x',
      });

      expect(result.applied).toBe(false);
      expect(walletsRepo.adjustBalance).not.toHaveBeenCalled();
    });

    it('throws when the wallet row is missing during the credit-back', async () => {
      walletsRepo.findTransactionById.mockResolvedValueOnce({
        id: 'tx_1',
        walletId: 'u1',
        type: 'withdrawal',
        amountCents: -500,
      } as never);
      walletsRepo.findByUserIdForUpdate.mockResolvedValueOnce(null);
      const svc = makeService();

      await expect(
        svc.reverseWithdrawal({} as DbClient, { transactionId: 'tx_1' }),
      ).rejects.toThrow(/missing during reverseWithdrawal/);
    });

    it('returns applied=false silently when transitionPendingTo loses the race', async () => {
      walletsRepo.findTransactionById.mockResolvedValueOnce({
        id: 'tx_1',
        walletId: 'u1',
        type: 'withdrawal',
        amountCents: -500,
      } as never);
      walletsRepo.findByUserIdForUpdate.mockResolvedValueOnce(mkWallet());
      walletsRepo.transitionPendingTo.mockResolvedValueOnce(false);
      const svc = makeService();

      const result = await svc.reverseWithdrawal({} as DbClient, {
        transactionId: 'tx_1',
      });

      expect(result.applied).toBe(false);
      expect(walletsRepo.adjustBalance).not.toHaveBeenCalled();
    });

    it('credits the balance back by subtracting the stored (negative) amount', async () => {
      walletsRepo.findTransactionById.mockResolvedValueOnce({
        id: 'tx_1',
        walletId: 'u1',
        type: 'withdrawal',
        amountCents: -500,
      } as never);
      walletsRepo.findByUserIdForUpdate.mockResolvedValueOnce(mkWallet());
      walletsRepo.transitionPendingTo.mockResolvedValueOnce(true);
      const svc = makeService();

      const result = await svc.reverseWithdrawal({} as DbClient, {
        transactionId: 'tx_1',
        stripeRef: 'tr_err',
      });

      expect(result.applied).toBe(true);
      expect(walletsRepo.adjustBalance).toHaveBeenCalledWith({}, 'u1', 500);
      expect(walletsRepo.transitionPendingTo).toHaveBeenCalledWith(
        {},
        'tx_1',
        'failed',
        { stripeRef: 'tr_err' },
      );
    });
  });

  describe('startPayoutOnboarding', () => {
    it('creates a Connect account on first call and returns the onboarding URL', async () => {
      walletsRepo.findByUserId.mockResolvedValue(mkWallet());
      stripe.createConnectExpressAccount.mockResolvedValueOnce(
        mkStripeAccount({ id: 'acct_new' }),
      );
      stripe.createConnectAccountLink.mockResolvedValueOnce({
        url: 'https://stripe.example/onboard',
      } as unknown as Stripe.AccountLink);

      const svc = makeService();
      const result = await svc.startPayoutOnboarding('u1');

      expect(stripe.createConnectExpressAccount).toHaveBeenCalledWith({
        userId: 'u1',
        email: undefined,
      });
      expect(walletsRepo.setConnectAccount).toHaveBeenCalledWith(
        txStub,
        'u1',
        'acct_new',
        'pending',
      );
      expect(result.onboardingUrl).toBe('https://stripe.example/onboard');
    });

    it('reuses the existing Connect account on a repeat call', async () => {
      walletsRepo.findByUserId.mockResolvedValue(
        mkWallet({ stripeConnectAccountId: 'acct_existing' }),
      );
      stripe.createConnectAccountLink.mockResolvedValueOnce({
        url: 'https://stripe.example/onboard',
      } as unknown as Stripe.AccountLink);

      const svc = makeService();
      await svc.startPayoutOnboarding('u1');

      expect(stripe.createConnectExpressAccount).not.toHaveBeenCalled();
      expect(stripe.createConnectAccountLink).toHaveBeenCalledWith(
        'acct_existing',
      );
    });
  });

  describe('getPayoutAccountStatus', () => {
    it('returns "none" when the wallet has no Connect account', async () => {
      walletsRepo.findByUserId.mockResolvedValue(mkWallet());
      const svc = makeService();

      const result = await svc.getPayoutAccountStatus('u1');

      expect(result.status).toBe('none');
      expect(stripe.retrieveAccount).not.toHaveBeenCalled();
    });

    it('refreshes the persisted status when Stripe reports a change', async () => {
      walletsRepo.findByUserId.mockResolvedValue(
        mkWallet({
          stripeConnectAccountId: 'acct_1',
          payoutStatus: 'pending',
        }),
      );
      stripe.retrieveAccount.mockResolvedValueOnce(
        mkStripeAccount({
          id: 'acct_1',
          payouts_enabled: true,
          details_submitted: true,
        }),
      );

      const svc = makeService();
      const result = await svc.getPayoutAccountStatus('u1');

      expect(result.status).toBe('active');
      expect(walletsRepo.setPayoutStatus).toHaveBeenCalledWith(
        txStub,
        'u1',
        'active',
      );
    });

    it('falls back to the persisted status when Stripe lookup throws', async () => {
      walletsRepo.findByUserId.mockResolvedValue(
        mkWallet({
          stripeConnectAccountId: 'acct_1',
          payoutStatus: 'active',
        }),
      );
      stripe.retrieveAccount.mockRejectedValueOnce(new Error('Stripe down'));
      const svc = makeService();

      const result = await svc.getPayoutAccountStatus('u1');

      expect(result.status).toBe('active');
      expect(walletsRepo.setPayoutStatus).not.toHaveBeenCalled();
    });

    it('classifies a hard-block disabled_reason as restricted', async () => {
      walletsRepo.findByUserId.mockResolvedValue(
        mkWallet({
          stripeConnectAccountId: 'acct_1',
          payoutStatus: 'active',
        }),
      );
      stripe.retrieveAccount.mockResolvedValueOnce(
        mkStripeAccount({
          id: 'acct_1',
          payouts_enabled: false,
          details_submitted: true,
          requirements: { disabled_reason: 'rejected.fraud' } as never,
        }),
      );

      const svc = makeService();
      const result = await svc.getPayoutAccountStatus('u1');

      expect(result.status).toBe('restricted');
    });
  });

  describe('syncAccountStatus', () => {
    it('logs and ignores an account that does not match any wallet', async () => {
      walletsRepo.findByConnectAccountId.mockResolvedValueOnce(null);
      const svc = makeService();

      await svc.syncAccountStatus(
        {} as DbClient,
        mkStripeAccount({ id: 'acct_unknown' }),
      );

      expect(walletsRepo.setPayoutStatus).not.toHaveBeenCalled();
    });

    it('persists the derived status when it differs from the stored one', async () => {
      walletsRepo.findByConnectAccountId.mockResolvedValueOnce(
        mkWallet({
          stripeConnectAccountId: 'acct_1',
          payoutStatus: 'pending',
        }),
      );
      const svc = makeService();

      await svc.syncAccountStatus(
        {} as DbClient,
        mkStripeAccount({
          id: 'acct_1',
          payouts_enabled: true,
          details_submitted: true,
        }),
      );

      expect(walletsRepo.setPayoutStatus).toHaveBeenCalledWith(
        {},
        'u1',
        'active',
      );
    });

    it('does not write when the derived status matches the stored one', async () => {
      walletsRepo.findByConnectAccountId.mockResolvedValueOnce(
        mkWallet({
          stripeConnectAccountId: 'acct_1',
          payoutStatus: 'pending',
        }),
      );
      const svc = makeService();

      await svc.syncAccountStatus(
        {} as DbClient,
        mkStripeAccount({ id: 'acct_1' }),
      );

      expect(walletsRepo.setPayoutStatus).not.toHaveBeenCalled();
    });
  });

  describe('findPendingTopupById', () => {
    it('returns null when the transaction is not a topup', async () => {
      walletsRepo.findTransactionById.mockResolvedValueOnce({
        id: 'tx_1',
        type: 'withdrawal',
      } as never);
      const svc = makeService();

      const row = await svc.findPendingTopupById({} as DbClient, 'tx_1');

      expect(row).toBeNull();
    });
  });

  describe('getOrCreateWallet', () => {
    it('throws a programmer error when the row is still missing after the upsert', async () => {
      walletsRepo.findByUserId.mockResolvedValueOnce(null);
      const svc = makeService();

      await expect(
        svc.getOrCreateWallet({} as DbClient, 'u_ghost'),
      ).rejects.toThrow(/missing after upsert/);
    });
  });

  describe('createWithdrawal — early-rejection paths', () => {
    it('rejects a non-integer amount with VALIDATION_FAILED', async () => {
      const svc = makeService();

      await expectErrorCode(
        svc.createWithdrawal('u1', 100.5),
        'VALIDATION_FAILED',
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects a zero or negative amount with VALIDATION_FAILED', async () => {
      const svc = makeService();

      await expectErrorCode(svc.createWithdrawal('u1', 0), 'VALIDATION_FAILED');
    });

    it('rejects when the wallet has no Connect account yet', async () => {
      walletsRepo.findByUserIdForUpdate.mockResolvedValueOnce(null);
      walletsRepo.findByUserId.mockResolvedValue(mkWallet());
      const svc = makeService();

      await expect(svc.createWithdrawal('u1', 500)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
