import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Thin wrapper around the official Stripe SDK. Centralises configuration
 * (secret key, API version) so the rest of the app never imports `stripe`
 * directly, and exposes only the call sites we actually use: Checkout
 * sessions for top-ups, Connect Express accounts + account links for
 * driver onboarding, transfers for withdrawals, and `constructEvent` for
 * webhook signature verification.
 *
 * Every state-changing call passes an `idempotencyKey` chosen by the
 * caller (the wallet_transactions row id) so a retry after a network
 * hiccup never duplicates a transfer or a Checkout session.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe;
  private readonly paymentsWebhookSecret: string;
  private readonly connectWebhookSecret: string;
  private readonly walletReturnUrl: string;
  private readonly connectReturnUrl: string;
  private readonly connectRefreshUrl: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Stripe(config.getOrThrow<string>('STRIPE_SECRET_KEY'), {
      // Pin the SDK to its built-in API version. Bumping the SDK is the
      // only way to move forward; the version is intentionally not
      // env-configurable.
      apiVersion: Stripe.API_VERSION as Stripe.LatestApiVersion,
      typescript: true,
      appInfo: { name: 'cogo-backend' },
    });
    this.paymentsWebhookSecret = config.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    this.connectWebhookSecret = config.getOrThrow<string>(
      'STRIPE_CONNECT_WEBHOOK_SECRET',
    );
    this.walletReturnUrl = config.getOrThrow<string>('WALLET_RETURN_URL');
    this.connectReturnUrl = config.getOrThrow<string>('CONNECT_RETURN_URL');
    this.connectRefreshUrl = config.getOrThrow<string>('CONNECT_REFRESH_URL');
  }

  /**
   * Creates a hosted Checkout session for a wallet top-up. `transactionId`
   * doubles as the idempotency key and as `client_reference_id` so the
   * webhook can correlate the session back to its `wallet_transactions`
   * row.
   */
  async createTopupCheckoutSession(params: {
    transactionId: string;
    userId: string;
    amountCents: number;
    customerEmail?: string;
  }): Promise<Stripe.Checkout.Session> {
    return this.client.checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: params.transactionId,
        success_url: this.walletReturnUrl,
        cancel_url: this.walletReturnUrl,
        customer_email: params.customerEmail,
        metadata: {
          transactionId: params.transactionId,
          userId: params.userId,
          kind: 'wallet_topup',
        },
        payment_intent_data: {
          metadata: {
            transactionId: params.transactionId,
            userId: params.userId,
            kind: 'wallet_topup',
          },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: params.amountCents,
              product_data: {
                name: 'CoGo wallet top-up',
              },
            },
          },
        ],
      },
      { idempotencyKey: params.transactionId },
    );
  }

  /** Creates a Spain Connect Express account for a driver. */
  async createConnectExpressAccount(params: {
    userId: string;
    email?: string;
  }): Promise<Stripe.Account> {
    return this.client.accounts.create(
      {
        type: 'express',
        country: 'ES',
        email: params.email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { userId: params.userId },
      },
      // userId is unique-per-driver and unchanging — safe key for the
      // initial-account-create call.
      { idempotencyKey: `connect-account:${params.userId}` },
    );
  }

  /** Creates a single-use onboarding link for an Express account. */
  async createConnectAccountLink(
    accountId: string,
  ): Promise<Stripe.AccountLink> {
    return this.client.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: this.connectReturnUrl,
      refresh_url: this.connectRefreshUrl,
    });
  }

  /** Fetches an Account so we can derive payout readiness. */
  async retrieveAccount(accountId: string): Promise<Stripe.Account> {
    return this.client.accounts.retrieve(accountId);
  }

  /**
   * Initiates a transfer from the platform balance to a connected account.
   * `withdrawalId` is the idempotency key — a retry never produces a
   * second transfer.
   */
  async createTransfer(params: {
    withdrawalId: string;
    amountCents: number;
    destinationAccountId: string;
  }): Promise<Stripe.Transfer> {
    return this.client.transfers.create(
      {
        amount: params.amountCents,
        currency: 'eur',
        destination: params.destinationAccountId,
        transfer_group: `withdrawal:${params.withdrawalId}`,
        metadata: { withdrawalId: params.withdrawalId },
      },
      { idempotencyKey: params.withdrawalId },
    );
  }

  /**
   * Verifies a webhook signature against the payments-scope secret and
   * returns the parsed event. Callers must pass the raw bytes — Stripe
   * recomputes the HMAC over the exact body.
   */
  constructPaymentsEvent(
    payload: Buffer | string,
    signature: string,
  ): Stripe.Event {
    return this.client.webhooks.constructEvent(
      payload,
      signature,
      this.paymentsWebhookSecret,
    );
  }

  /** Same as `constructPaymentsEvent` but with the connect-scope secret. */
  constructConnectEvent(
    payload: Buffer | string,
    signature: string,
  ): Stripe.Event {
    return this.client.webhooks.constructEvent(
      payload,
      signature,
      this.connectWebhookSecret,
    );
  }

  /**
   * Exposed for the e2e webhook tests, which need to sign a fixture
   * payload with the test secret rather than calling Stripe.
   */
  static generateTestSignature(
    payload: string,
    secret: string,
    timestamp = Math.floor(Date.now() / 1000),
  ): string {
    return Stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
      timestamp,
    });
  }
}
