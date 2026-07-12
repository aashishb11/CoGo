import { Module } from '@nestjs/common';
import { RatingsAdminController } from './ratings.admin.controller';
import { RatingsController } from './ratings.controller';
import { RatingsRepository } from './ratings.repository';
import { RatingsService } from './ratings.service';

// RatingsModule owns the post-ride rating surface (US-07/08/09). It never
// imports TripsModule — eligibility resolves via a cross-table read-only
// join in `RatingsRepository` (rides + trips + bookings), the same
// convention exception documented for `IncidentsRepository`.
// See docs/plans/2026-05-25-user-ratings.md §Module layout.
@Module({
  controllers: [RatingsController, RatingsAdminController],
  providers: [RatingsService, RatingsRepository],
})
export class RatingsModule {}
