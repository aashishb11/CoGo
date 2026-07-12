import { Module } from '@nestjs/common';
import { StripeModule } from '@integrations/stripe/stripe.module';
import { ConnectBounceController } from './connect-bounce.controller';
import { WalletController } from './wallet.controller';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';
import { StripeWebhookController } from './webhook.controller';

@Module({
  imports: [StripeModule],
  controllers: [
    WalletController,
    StripeWebhookController,
    ConnectBounceController,
  ],
  providers: [WalletService, WalletRepository],
  exports: [WalletService, WalletRepository],
})
export class WalletModule {}
