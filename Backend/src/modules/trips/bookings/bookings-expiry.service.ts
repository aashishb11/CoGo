import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { BookingsRepository } from './bookings.repository';
import { BookingsService } from './bookings.service';

@Injectable()
export class BookingsExpiryService {
  private readonly logger = new Logger(BookingsExpiryService.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly bookingsRepo: BookingsRepository,
    private readonly bookingsService: BookingsService,
  ) {}

  // Failures are swallowed so a single bad sweep doesn't crash the cron host.
  @Cron('*/15 * * * *')
  async sweep(): Promise<number> {
    try {
      // Funnel every expiry through `markBookingResolved` so the uniform
      // hold-release contract holds. Pending bookings have no hold, so the
      // release path inside the seam is a no-op for them — but routing
      // through one method keeps the contract single-source.
      return await this.db.transaction(async (tx) => {
        const ids = await this.bookingsRepo.findPendingIdsOnPastRides(tx);
        let expired = 0;
        for (const id of ids) {
          const { applied } = await this.bookingsService.markBookingResolved(
            tx,
            id,
            'expired',
          );
          if (applied) expired += 1;
        }
        this.logger.log(`Expired ${expired} pending bookings on past rides`);
        return expired;
      });
    } catch (err) {
      this.logger.error('bookings-expiry sweep failed', err);
      return 0;
    }
  }
}
