import type { INestApplication } from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import { walletTransactions, wallets } from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import { StripeService } from '@integrations/stripe/stripe.service';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';

type CreateTopupResponse = { transactionId: string; checkoutUrl: string };
type WalletResponse = {
  balanceCents: number;
  heldCents: number;
  availableCents: number;
  payoutStatus: 'none' | 'pending' | 'active' | 'restricted';
  recentTransactions: {
    id: string;
    type: 'topup' | 'withdrawal' | 'payment' | 'earning';
    status: 'pending' | 'completed' | 'failed';
    amountCents: number;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
};
type PayoutAccountResponse = { status: WalletResponse['payoutStatus'] };
type StartPayoutResponse = { onboardingUrl: string };
type CreateWithdrawalResponse = {
  transactionId: string;
  status: 'completed' | 'pending' | 'failed';
};

// Hand-typed Stripe SDK stub. The wallet module never imports `stripe`
// at the application layer (StripeService does), so a structural mock
// here is enough — DI overrides plug it in. Mocks carry the minimal
// return shape WalletService actually reads, so `mockResolvedValueOnce`
// stays typed without coupling tests to the full Stripe SDK types.
type AccountMock = {
  id: string;
  object: string;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  details_submitted?: boolean;
  requirements: {
    disabled_reason?: string | null;
    currently_due?: string[];
  } & Record<string, unknown>;
};
type StripeStub = {
  createTopupCheckoutSession: jest.Mock<
    (...args: unknown[]) => Promise<{ id: string; url: string }>
  >;
  createConnectExpressAccount: jest.Mock<
    (...args: unknown[]) => Promise<AccountMock>
  >;
  createConnectAccountLink: jest.Mock<
    (...args: unknown[]) => Promise<{ url: string }>
  >;
  retrieveAccount: jest.Mock<(...args: unknown[]) => Promise<AccountMock>>;
  createTransfer: jest.Mock<(...args: unknown[]) => Promise<{ id: string }>>;
  constructPaymentsEvent: jest.Mock<
    (payload: Buffer | string, signature: string) => unknown
  >;
  constructConnectEvent: jest.Mock<
    (payload: Buffer | string, signature: string) => unknown
  >;
};

const PAYMENTS_SECRET = 'whsec_test_payments';
const CONNECT_SECRET = 'whsec_test_connect';

const signedEvent = (body: object, secret: string) => {
  const payload = JSON.stringify(body);
  const signature = StripeService.generateTestSignature(payload, secret);
  return { payload, signature };
};

describe('Wallet (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let mailService: MailService;
  let stripe: StripeStub;

  // Real verifier that signs/verifies with the test secrets. We share
  // ONE instance per suite so the constructEvent mocks always delegate
  // to a properly-configured StripeService no matter how often we reset
  // the API-call mocks between tests.
  const realVerifier = new StripeService({
    getOrThrow: <T>(key: string): T => {
      const map: Record<string, string> = {
        STRIPE_SECRET_KEY: 'sk_test_dummy',
        STRIPE_WEBHOOK_SECRET: PAYMENTS_SECRET,
        STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT_SECRET,
        WALLET_RETURN_URL: 'cogo://wallet',
        CONNECT_RETURN_URL: 'cogo://wallet/payout-account',
        CONNECT_REFRESH_URL: 'cogo://wallet/payout-account?refresh=1',
      };
      return map[key] as unknown as T;
    },
  } as never);

  const buildStripeStub = (): StripeStub => ({
    createTopupCheckoutSession: jest.fn(),
    createConnectExpressAccount: jest.fn(),
    createConnectAccountLink: jest.fn(),
    retrieveAccount: jest.fn(),
    createTransfer: jest.fn(),
    constructPaymentsEvent: jest.fn((payload, sig) =>
      realVerifier.constructPaymentsEvent(payload, sig),
    ),
    constructConnectEvent: jest.fn((payload, sig) =>
      realVerifier.constructConnectEvent(payload, sig),
    ),
  });

  beforeAll(async () => {
    stripe = buildStripeStub();
    ({ app, db, mailService } = await bootstrapTestApp({
      providerOverrides: [{ provide: StripeService, useValue: stripe }],
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
    // Reset only the API-call mocks; the signature verifiers stay live.
    stripe.createTopupCheckoutSession.mockReset();
    stripe.createConnectExpressAccount.mockReset();
    stripe.createConnectAccountLink.mockReset();
    stripe.retrieveAccount.mockReset();
    stripe.createTransfer.mockReset();
  });

  const newUser = (suffix: string) =>
    signUpAndVerify(app, mailService, {
      email: `${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: 'password123',
      name: `User ${suffix}`,
    });

  // ── GET /me/wallet ─────────────────────────────────────────────────────

  describe('GET /me/wallet', () => {
    it('lazy-creates the wallet on first access', async () => {
      const u = await newUser('w');

      const res = await request(app.getHttpServer())
        .get('/api/me/wallet')
        .set('Cookie', u.cookie)
        .expect(200);

      const body = res.body as WalletResponse;
      expect(body).toMatchObject({
        balanceCents: 0,
        heldCents: 0,
        availableCents: 0,
        payoutStatus: 'none',
        recentTransactions: [],
      });

      const rows = await db.select().from(wallets);
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(u.userId);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/me/wallet').expect(401);
    });
  });

  // ── POST /me/wallet/top-ups ───────────────────────────────────────────

  describe('POST /me/wallet/top-ups', () => {
    it('opens a Checkout session and returns the URL plus a pending tx', async () => {
      const u = await newUser('w');
      stripe.createTopupCheckoutSession.mockResolvedValueOnce({
        id: 'cs_test_1',
        url: 'https://checkout.stripe.test/cs_test_1',
      });

      const res = await request(app.getHttpServer())
        .post('/api/me/wallet/top-ups')
        .set('Cookie', u.cookie)
        .send({ amountCents: 2000 })
        .expect(201);

      const body = res.body as CreateTopupResponse;
      expect(body.checkoutUrl).toBe('https://checkout.stripe.test/cs_test_1');
      expect(body.transactionId).toMatch(/^[0-9a-f-]{36}$/);

      const txs = await db.select().from(walletTransactions);
      expect(txs).toHaveLength(1);
      expect(txs[0]).toMatchObject({
        id: body.transactionId,
        walletId: u.userId,
        type: 'topup',
        status: 'pending',
        amountCents: 2000,
      });
      expect(stripe.createTopupCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: body.transactionId,
          userId: u.userId,
          amountCents: 2000,
        }),
      );
    });

    it('rejects amounts outside [100, 50000]', async () => {
      const u = await newUser('w');
      await request(app.getHttpServer())
        .post('/api/me/wallet/top-ups')
        .set('Cookie', u.cookie)
        .send({ amountCents: 50 })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/me/wallet/top-ups')
        .set('Cookie', u.cookie)
        .send({ amountCents: 50001 })
        .expect(400);
    });
  });

  // ── POST /webhooks/stripe ─────────────────────────────────────────────

  describe('POST /webhooks/stripe', () => {
    const createPendingTopup = async (
      userCookie: string[],
      amount: number,
    ): Promise<string> => {
      stripe.createTopupCheckoutSession.mockResolvedValueOnce({
        id: `cs_for_${amount}`,
        url: 'https://checkout.stripe.test/cs',
      });
      const res = await request(app.getHttpServer())
        .post('/api/me/wallet/top-ups')
        .set('Cookie', userCookie)
        .send({ amountCents: amount })
        .expect(201);
      return (res.body as CreateTopupResponse).transactionId;
    };

    it('rejects payloads with an invalid signature', async () => {
      await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'totally-bogus')
        .set('content-type', 'application/json')
        .send({})
        .expect(400);
    });

    it('credits a successful checkout.session.completed event', async () => {
      const u = await newUser('w');
      const transactionId = await createPendingTopup(u.cookie, 2000);

      const { payload, signature } = signedEvent(
        {
          id: 'evt_completed_1',
          object: 'event',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_completed_1',
              object: 'checkout.session',
              client_reference_id: transactionId,
              payment_status: 'paid',
              metadata: { transactionId, userId: u.userId },
            },
          },
        },
        PAYMENTS_SECRET,
      );

      await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .set('stripe-signature', signature)
        .set('content-type', 'application/json')
        .send(payload)
        .expect(204);

      const wallet = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, u.userId));
      expect(wallet[0].balanceCents).toBe(2000);

      const [tx] = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.id, transactionId));
      expect(tx.status).toBe('completed');
      expect(tx.stripeRef).toBe('cs_test_completed_1');
    });

    it('is idempotent on duplicate delivery of the same checkout event', async () => {
      const u = await newUser('w');
      const transactionId = await createPendingTopup(u.cookie, 2000);

      const { payload, signature } = signedEvent(
        {
          id: 'evt_completed_dup',
          object: 'event',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_dup',
              object: 'checkout.session',
              client_reference_id: transactionId,
              payment_status: 'paid',
              metadata: {},
            },
          },
        },
        PAYMENTS_SECRET,
      );

      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/api/webhooks/stripe')
          .set('stripe-signature', signature)
          .set('content-type', 'application/json')
          .send(payload)
          .expect(204);
      }

      const [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, u.userId));
      expect(wallet.balanceCents).toBe(2000);
    });

    it('marks a top-up failed on payment_intent.payment_failed', async () => {
      const u = await newUser('w');
      const transactionId = await createPendingTopup(u.cookie, 2000);

      const { payload, signature } = signedEvent(
        {
          id: 'evt_failed_1',
          object: 'event',
          type: 'payment_intent.payment_failed',
          data: {
            object: {
              id: 'pi_failed_1',
              object: 'payment_intent',
              metadata: { transactionId },
            },
          },
        },
        PAYMENTS_SECRET,
      );

      await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .set('stripe-signature', signature)
        .set('content-type', 'application/json')
        .send(payload)
        .expect(204);

      const [tx] = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.id, transactionId));
      expect(tx.status).toBe('failed');

      const [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, u.userId));
      expect(wallet.balanceCents).toBe(0);
    });
  });

  // ── /me/wallet/payout-account ─────────────────────────────────────────

  describe('Connect onboarding', () => {
    it('creates an Express account and returns an onboarding URL', async () => {
      const u = await newUser('w');
      stripe.createConnectExpressAccount.mockResolvedValueOnce({
        id: 'acct_test_1',
        object: 'account',
        payouts_enabled: false,
        charges_enabled: false,
        requirements: {},
      });
      stripe.createConnectAccountLink.mockResolvedValueOnce({
        url: 'https://connect.stripe.test/setup/acct_test_1/link',
      });

      const res = await request(app.getHttpServer())
        .post('/api/me/wallet/payout-account')
        .set('Cookie', u.cookie)
        .expect(201);

      expect((res.body as StartPayoutResponse).onboardingUrl).toMatch(
        /^https:\/\/connect\.stripe\.test\//,
      );
      const [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, u.userId));
      expect(wallet.stripeConnectAccountId).toBe('acct_test_1');
      expect(wallet.payoutStatus).toBe('pending');
    });

    it('reports the current status', async () => {
      const u = await newUser('w');
      stripe.createConnectExpressAccount.mockResolvedValueOnce({
        id: 'acct_status_1',
        object: 'account',
        payouts_enabled: false,
        charges_enabled: false,
        requirements: {},
      });
      stripe.createConnectAccountLink.mockResolvedValueOnce({
        url: 'https://connect.stripe.test/setup/acct_status_1/link',
      });
      stripe.retrieveAccount.mockResolvedValueOnce({
        id: 'acct_status_1',
        object: 'account',
        payouts_enabled: false,
        charges_enabled: false,
        requirements: {},
      });
      await request(app.getHttpServer())
        .post('/api/me/wallet/payout-account')
        .set('Cookie', u.cookie)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/me/wallet/payout-account')
        .set('Cookie', u.cookie)
        .expect(200);

      expect((res.body as PayoutAccountResponse).status).toBe('pending');
    });

    // The driver flow only requests the `transfers` capability — Spain
    // Connect Express accounts that never asked for `card_payments` keep
    // `charges_enabled: false` even when fully onboarded. The status must
    // depend on `payouts_enabled` only.
    it('reports active when payouts_enabled is true (charges_enabled stays false for transfers-only accounts)', async () => {
      const u = await newUser('w');
      stripe.createConnectExpressAccount.mockResolvedValueOnce({
        id: 'acct_active_1',
        object: 'account',
        payouts_enabled: false,
        charges_enabled: false,
        requirements: {},
      });
      stripe.createConnectAccountLink.mockResolvedValueOnce({
        url: 'https://connect.stripe.test/setup/acct_active_1/link',
      });
      stripe.retrieveAccount.mockResolvedValueOnce({
        id: 'acct_active_1',
        object: 'account',
        payouts_enabled: true,
        charges_enabled: false,
        details_submitted: true,
        requirements: { disabled_reason: null, currently_due: [] },
      });
      await request(app.getHttpServer())
        .post('/api/me/wallet/payout-account')
        .set('Cookie', u.cookie)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/me/wallet/payout-account')
        .set('Cookie', u.cookie)
        .expect(200);

      expect((res.body as PayoutAccountResponse).status).toBe('active');
    });

    // Stripe stamps `requirements.disabled_reason = 'requirements.past_due'`
    // on a freshly-created account before the driver has provided anything.
    // That is "still pending — finish onboarding", not "restricted".
    it('reports pending when details_submitted is false even with disabled_reason set', async () => {
      const u = await newUser('w');
      stripe.createConnectExpressAccount.mockResolvedValueOnce({
        id: 'acct_pending_1',
        object: 'account',
        payouts_enabled: false,
        charges_enabled: false,
        requirements: {},
      });
      stripe.createConnectAccountLink.mockResolvedValueOnce({
        url: 'https://connect.stripe.test/setup/acct_pending_1/link',
      });
      stripe.retrieveAccount.mockResolvedValueOnce({
        id: 'acct_pending_1',
        object: 'account',
        payouts_enabled: false,
        charges_enabled: false,
        details_submitted: false,
        requirements: {
          disabled_reason: 'requirements.past_due',
          currently_due: ['business_profile.mcc'],
        },
      });
      await request(app.getHttpServer())
        .post('/api/me/wallet/payout-account')
        .set('Cookie', u.cookie)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/me/wallet/payout-account')
        .set('Cookie', u.cookie)
        .expect(200);

      expect((res.body as PayoutAccountResponse).status).toBe('pending');
    });

    // After submission, a hard block (rejected/under_review/listed/
    // platform_paused) is what `restricted` is reserved for.
    it('reports restricted only when Stripe has applied a hard block after submission', async () => {
      const u = await newUser('w');
      stripe.createConnectExpressAccount.mockResolvedValueOnce({
        id: 'acct_restricted_1',
        object: 'account',
        payouts_enabled: false,
        charges_enabled: false,
        requirements: {},
      });
      stripe.createConnectAccountLink.mockResolvedValueOnce({
        url: 'https://connect.stripe.test/setup/acct_restricted_1/link',
      });
      stripe.retrieveAccount.mockResolvedValueOnce({
        id: 'acct_restricted_1',
        object: 'account',
        payouts_enabled: false,
        charges_enabled: false,
        details_submitted: true,
        requirements: { disabled_reason: 'rejected.fraud', currently_due: [] },
      });
      await request(app.getHttpServer())
        .post('/api/me/wallet/payout-account')
        .set('Cookie', u.cookie)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/me/wallet/payout-account')
        .set('Cookie', u.cookie)
        .expect(200);

      expect((res.body as PayoutAccountResponse).status).toBe('restricted');
    });
  });

  // ── /me/wallet/withdrawals ────────────────────────────────────────────

  describe('POST /me/wallet/withdrawals', () => {
    const seedActiveAccount = async (
      userId: string,
      balanceCents: number,
    ): Promise<void> => {
      // The endpoint won't bootstrap a wallet, but GET /me/wallet does;
      // call it first to make the row exist.
      await db
        .insert(wallets)
        .values({
          userId,
          balanceCents,
          heldCents: 0,
          stripeConnectAccountId: 'acct_test_active',
          payoutStatus: 'active',
        })
        .onConflictDoUpdate({
          target: wallets.userId,
          set: {
            balanceCents,
            stripeConnectAccountId: 'acct_test_active',
            payoutStatus: 'active',
          },
        });
    };

    it('debits the wallet and settles when Stripe accepts the transfer', async () => {
      const u = await newUser('w');
      await seedActiveAccount(u.userId, 1000);
      stripe.createTransfer.mockResolvedValueOnce({ id: 'tr_test_1' });

      const res = await request(app.getHttpServer())
        .post('/api/me/wallet/withdrawals')
        .set('Cookie', u.cookie)
        .send({ amountCents: 500 })
        .expect(201);

      expect((res.body as CreateWithdrawalResponse).status).toBe('completed');

      const [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, u.userId));
      expect(wallet.balanceCents).toBe(500);

      const [tx] = await db
        .select()
        .from(walletTransactions)
        .where(
          eq(
            walletTransactions.id,
            (res.body as CreateWithdrawalResponse).transactionId,
          ),
        );
      expect(tx.status).toBe('completed');
      expect(tx.stripeRef).toBe('tr_test_1');
      expect(tx.amountCents).toBe(-500);
    });

    it('refuses when payout account is not active', async () => {
      const u = await newUser('w');
      // Wallet exists but payout_status = none.
      await db.insert(wallets).values({ userId: u.userId, balanceCents: 500 });

      await request(app.getHttpServer())
        .post('/api/me/wallet/withdrawals')
        .set('Cookie', u.cookie)
        .send({ amountCents: 100 })
        .expect(403);
    });

    it('refuses when amount exceeds available balance', async () => {
      const u = await newUser('w');
      await seedActiveAccount(u.userId, 200);

      await request(app.getHttpServer())
        .post('/api/me/wallet/withdrawals')
        .set('Cookie', u.cookie)
        .send({ amountCents: 500 })
        .expect(400);
      // No Stripe call.
      expect(stripe.createTransfer).not.toHaveBeenCalled();
    });
  });

  // ── POST /webhooks/stripe/connect ─────────────────────────────────────

  describe('POST /webhooks/stripe/connect', () => {
    it('flips payout_status to active on account.updated when ready', async () => {
      const u = await newUser('w');
      await db.insert(wallets).values({
        userId: u.userId,
        balanceCents: 0,
        heldCents: 0,
        stripeConnectAccountId: 'acct_x',
        payoutStatus: 'pending',
      });

      const { payload, signature } = signedEvent(
        {
          id: 'evt_account_x',
          object: 'event',
          type: 'account.updated',
          data: {
            object: {
              id: 'acct_x',
              object: 'account',
              payouts_enabled: true,
              charges_enabled: true,
              requirements: {},
            },
          },
        },
        CONNECT_SECRET,
      );

      await request(app.getHttpServer())
        .post('/api/webhooks/stripe/connect')
        .set('stripe-signature', signature)
        .set('content-type', 'application/json')
        .send(payload)
        .expect(204);

      const [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, u.userId));
      expect(wallet.payoutStatus).toBe('active');
    });

    it('rejects payloads signed with the payments secret', async () => {
      const { payload, signature } = signedEvent(
        { id: 'evt_x', type: 'account.updated' },
        PAYMENTS_SECRET,
      );

      await request(app.getHttpServer())
        .post('/api/webhooks/stripe/connect')
        .set('stripe-signature', signature)
        .set('content-type', 'application/json')
        .send(payload)
        .expect(400);
    });
  });
});
