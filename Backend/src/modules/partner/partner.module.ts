import { Module } from '@nestjs/common';
import { TripsModule } from '@modules/trips/trips.module';
import { PartnerController } from './partner.controller';
import { PartnerKeyGuard } from './partner-key.guard';

// Partner API: a versioned, separately-authenticated subset of the rides data
// for external integrations. Logic is reused from RidesService (exported by
// TripsModule) — this module only owns auth, the public contract, and docs.
@Module({
  imports: [TripsModule],
  controllers: [PartnerController],
  providers: [PartnerKeyGuard],
})
export class PartnerModule {}
