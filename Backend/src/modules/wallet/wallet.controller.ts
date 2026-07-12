import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { CreateTopupDto } from './dto/create-topup.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import {
  CreateTopupResponseDto,
  CreateWithdrawalResponseDto,
  PayoutAccountResponseDto,
  StartPayoutOnboardingResponseDto,
  WalletResponseDto,
  WalletTransactionListResponseDto,
} from './dto/wallet-response.dto';
import { WalletTransactionsQueryDto } from './dto/wallet-transactions-query.dto';
import { toWalletResponse, toWalletTransactionDto } from './wallet.mapper';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';

const RECENT_TRANSACTIONS_LIMIT = 5;

@ApiTags('Wallet')
@ApiCookieAuth('better-auth.session_token')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('me/wallet')
export class WalletController {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly walletService: WalletService,
    private readonly walletsRepo: WalletRepository,
  ) {}

  @Get()
  @ApiOperation({
    description:
      "Returns the authenticated user's wallet (balance, held, available, payout-account status) plus the five newest transactions. The wallet is created on first access; no setup step is required. `heldCents` is always 0 until Phase 5 (boarding & holds) wires holds.",
  })
  @ApiOkResponse({ type: WalletResponseDto })
  async getMyWallet(
    @Session() session: UserSession,
  ): Promise<WalletResponseDto> {
    return this.db.transaction(async (tx) => {
      const wallet = await this.walletService.getOrCreateWallet(
        tx,
        session.user.id,
      );
      const recent = await this.walletsRepo.listRecentTransactions(
        tx,
        session.user.id,
        RECENT_TRANSACTIONS_LIMIT,
      );
      return toWalletResponse(wallet, recent);
    });
  }

  @Get('transactions')
  @ApiOperation({
    description:
      'Paginated wallet history, newest first. Default page size is 20 (max 100).',
  })
  @ApiOkResponse({ type: WalletTransactionListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  async listTransactions(
    @Session() session: UserSession,
    @Query() query: WalletTransactionsQueryDto,
  ): Promise<WalletTransactionListResponseDto> {
    return this.db.transaction(async (tx) => {
      await this.walletService.getOrCreateWallet(tx, session.user.id);
      const offset = (query.page - 1) * query.limit;
      const [rows, total] = await Promise.all([
        this.walletsRepo.listTransactions(tx, session.user.id, {
          limit: query.limit,
          offset,
        }),
        this.walletsRepo.countTransactions(tx, session.user.id),
      ]);
      return {
        items: rows.map(toWalletTransactionDto),
        page: query.page,
        limit: query.limit,
        total,
      };
    });
  }

  @Post('top-ups')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    description:
      'Starts a wallet top-up. Persists a `pending` transaction, then opens a Stripe-hosted Checkout session and returns its URL. The webhook reconciles the row to `completed` or `failed` once Stripe confirms the payment.',
  })
  @ApiCreatedResponse({ type: CreateTopupResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      '`TOPUP_AMOUNT_OUT_OF_RANGE` when `amountCents` is outside [100, 50000].',
  })
  async createTopup(
    @Session() session: UserSession,
    @Body() body: CreateTopupDto,
  ): Promise<CreateTopupResponseDto> {
    return this.walletService.createTopup(session.user.id, body.amountCents, {
      customerEmail: session.user.email,
    });
  }

  @Post('payout-account')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    description:
      'Starts (or resumes) Stripe Connect Express onboarding for the authenticated driver. Returns a single-use hosted onboarding URL. The Connect webhook flips `payoutStatus` to `active` once Stripe confirms the account is ready.',
  })
  @ApiCreatedResponse({ type: StartPayoutOnboardingResponseDto })
  async startPayoutOnboarding(
    @Session() session: UserSession,
  ): Promise<StartPayoutOnboardingResponseDto> {
    return this.walletService.startPayoutOnboarding(session.user.id);
  }

  @Get('payout-account')
  @ApiOperation({
    description:
      "Returns the authenticated user's Connect payout-account status. `none` = onboarding not started; `pending` = account exists but onboarding incomplete; `active` = payouts enabled; `restricted` = Stripe has disabled the account.",
  })
  @ApiOkResponse({ type: PayoutAccountResponseDto })
  async getPayoutAccount(
    @Session() session: UserSession,
  ): Promise<PayoutAccountResponseDto> {
    return this.walletService.getPayoutAccountStatus(session.user.id);
  }

  @Post('withdrawals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    description:
      "Withdraws the requested cents from the wallet to the driver's connected bank account. Three-step transfer flow: reserve (debit), Stripe transfer, settle-or-reverse. Returns the `transactionId` and one of `completed` / `pending` / `failed`. Refuses with `PAYOUT_ACCOUNT_NOT_READY` when the Connect account isn't `active`, or `INSUFFICIENT_WALLET_BALANCE` when the amount exceeds available balance.",
  })
  @ApiCreatedResponse({ type: CreateWithdrawalResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async createWithdrawal(
    @Session() session: UserSession,
    @Body() body: CreateWithdrawalDto,
  ): Promise<CreateWithdrawalResponseDto> {
    return this.walletService.createWithdrawal(
      session.user.id,
      body.amountCents,
    );
  }
}
