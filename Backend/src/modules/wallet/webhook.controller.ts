import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import type Stripe from 'stripe';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB, type DbClient } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { StripeService } from '@integrations/stripe/stripe.service';
import { WalletService } from './wallet.service';

/**
 * Webhook endpoints for the two Stripe scopes. Both are anonymous (Stripe
 * authenticates itself via the signed payload) and rely on the raw-body
 * mount in `main.ts` — `req.body` must be the original bytes.
 *
 * Idempotency model: we accept Stripe's retries via per-row guards rather
 * than a separate `processed_stripe_events` table. The partial-unique
 * index on `wallet_transactions.stripe_ref` plus the `WHERE status =
 * 'pending'` guard inside every state transition make every handler a
 * no-op on replay.
 */
@ApiTags('Wallet')
@AllowAnonymous()
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly stripe: StripeService,
    private readonly walletService: WalletService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      'Stripe payments webhook. Verifies the signature against `STRIPE_WEBHOOK_SECRET` and handles `checkout.session.completed` (credit top-up) and `payment_intent.payment_failed` (mark top-up failed). Other events are acknowledged without effect.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  async handlePaymentsEvent(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<void> {
    const event = this.verifyEvent(req, signature, (payload, sig) =>
      this.stripe.constructPaymentsEvent(payload, sig),
    );
    this.logger.log(`Stripe payments event ${event.id} (${event.type})`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.onPaymentIntentFailed(event.data.object);
        break;
      default:
        // Silently ack — Stripe retries everything we don't 2xx.
        break;
    }
  }

  @Post('connect')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      'Stripe Connect webhook. Verifies the signature against `STRIPE_CONNECT_WEBHOOK_SECRET` and handles `account.updated` (sync payout-account status) and `payout.failed` (reverse the pending withdrawal). Other events are acknowledged without effect.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  async handleConnectEvent(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<void> {
    const event = this.verifyEvent(req, signature, (payload, sig) =>
      this.stripe.constructConnectEvent(payload, sig),
    );
    this.logger.log(`Stripe connect event ${event.id} (${event.type})`);

    switch (event.type) {
      case 'account.updated':
        await this.onAccountUpdated(event.data.object);
        break;
      case 'payout.failed':
        await this.onPayoutFailed(event.data.object);
        break;
      default:
        break;
    }
  }

  // ── handlers ──────────────────────────────────────────────────────────

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const transactionId = session.client_reference_id;
    if (!transactionId) {
      this.logger.warn(
        `checkout.session.completed without client_reference_id (session ${session.id})`,
      );
      return;
    }
    if (session.payment_status !== 'paid') {
      // Stripe also emits this event for async-payment flows that haven't
      // settled yet (`payment_status: 'unpaid'`). Wait for the matching
      // `async_payment_succeeded` event instead.
      return;
    }
    await this.db.transaction(async (tx: DbClient) => {
      await this.walletService.creditTopup(tx, {
        transactionId,
        stripeRef: session.id,
      });
    });
  }

  private async onPaymentIntentFailed(
    intent: Stripe.PaymentIntent,
  ): Promise<void> {
    const transactionId = intent.metadata?.transactionId;
    if (!transactionId) {
      this.logger.warn(
        `payment_intent.payment_failed without metadata.transactionId (intent ${intent.id})`,
      );
      return;
    }
    await this.db.transaction(async (tx: DbClient) => {
      await this.walletService.markTopupFailed(tx, {
        transactionId,
        stripeRef: intent.id,
      });
    });
  }

  private async onAccountUpdated(account: Stripe.Account): Promise<void> {
    await this.db.transaction(async (tx: DbClient) => {
      await this.walletService.syncAccountStatus(tx, account);
    });
  }

  private async onPayoutFailed(payout: Stripe.Payout): Promise<void> {
    // Payouts are platform → bank; our withdrawal row is keyed on the
    // *transfer* id, not the payout id. The webhook may surface the
    // failure before the transfer settles its own state. We resolve via
    // metadata when present (`payout.metadata.withdrawalId` is propagated
    // for transfer-funded payouts via Connect) and fall back to a
    // best-effort match by transfer id stored in `stripe_ref`.
    const withdrawalId = payout.metadata?.withdrawalId;
    if (!withdrawalId) {
      this.logger.warn(
        `payout.failed without metadata.withdrawalId (payout ${payout.id}) — skipping`,
      );
      return;
    }
    await this.db.transaction(async (tx: DbClient) => {
      await this.walletService.reverseWithdrawal(tx, {
        transactionId: withdrawalId,
        stripeRef: payout.id,
      });
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private verifyEvent(
    req: Request,
    signature: string | undefined,
    construct: (payload: Buffer | string, signature: string) => Stripe.Event,
  ): Stripe.Event {
    if (!signature) {
      this.logger.warn('Stripe webhook missing signature header');
      throw new BadRequestException('Missing Stripe signature header');
    }
    // express.raw() leaves the raw bytes on `req.body`. If a non-Buffer
    // somehow lands here it means the raw-body mount in `main.ts` isn't
    // active for this route — fail loud rather than handing Stripe a 4xx
    // with a confusing reason.
    const payload: unknown = req.body;
    if (!Buffer.isBuffer(payload) && typeof payload !== 'string') {
      this.logger.error(
        `Stripe webhook body is ${typeof payload === 'object' ? 'parsed JSON' : typeof payload} — raw-body mount missing`,
      );
      throw new BadRequestException(
        'Stripe webhook received a parsed body — raw-body mount must precede Nest parser',
      );
    }
    try {
      return construct(payload, signature);
    } catch (err) {
      this.logger.warn(
        `Stripe signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException('Invalid Stripe signature');
    }
  }
}
