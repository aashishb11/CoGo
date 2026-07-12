import { Module } from '@nestjs/common';
import { MailModule } from '@integrations/mail/mail.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';
import { SafetyAdminController } from './safety.admin.controller';
import { TrustedContactController } from './trusted-contact.controller';
import { TrustedContactRepository } from './trusted-contact.repository';
import { TrustedContactService } from './trusted-contact.service';

// SafetyModule owns trusted-contact CRUD + `assertHasContact` gate AND the
// US-06 incident-reporting surface. SafetyModule must NEVER import
// TripsModule — the dependency direction is TripsModule → SafetyModule so
// `BookingsService` and `TripsService` can call
// `TrustedContactService.assertHasContact`. `IncidentsRepository` reads
// across ride/trip/user/car tables directly (an intentional convention
// exception documented in `docs/plans/2026-05-21-safety-and-payments.md`)
// to avoid that cycle.
@Module({
  imports: [MailModule],
  controllers: [
    TrustedContactController,
    IncidentsController,
    SafetyAdminController,
  ],
  providers: [
    TrustedContactService,
    TrustedContactRepository,
    IncidentsService,
    IncidentsRepository,
  ],
  exports: [TrustedContactService],
})
export class SafetyModule {}
