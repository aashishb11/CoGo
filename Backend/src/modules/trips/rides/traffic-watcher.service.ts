import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { TrafficService } from '@integrations/traffic/traffic.service';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { BookingsRepository } from '../bookings/bookings.repository';
import { shouldNotifyTrafficDelay } from '../domain/traffic-alert';
import { RidesRepository } from './rides.repository';
import type { UpcomingActiveRide } from './rides.repository';

/** Lookahead window for "is this ride starting soon enough to check traffic". */
const TRAFFIC_ALERT_WINDOW_MINUTES = 60;

@Injectable()
export class TrafficWatcherService {
  private readonly logger = new Logger(TrafficWatcherService.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly ridesRepo: RidesRepository,
    private readonly bookingsRepo: BookingsRepository,
    private readonly trafficService: TrafficService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Runs every 10 minutes and checks traffic for all upcoming active rides. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkTrafficAlerts(): Promise<void> {
    const upcomingRides = await this.ridesRepo.findUpcomingActive(
      this.db,
      TRAFFIC_ALERT_WINDOW_MINUTES,
    );

    this.logger.log(`Found ${upcomingRides.length} upcoming ride(s) to check`);

    for (const ride of upcomingRides) {
      try {
        await this.processRide(ride);
      } catch (err) {
        this.logger.error(
          `Traffic check failed for ride ${ride.id}`,
          err instanceof Error ? err.stack : err,
        );
      }
    }
  }

  // ── private ──────────────────────────────────────────────────────────────

  private async processRide(ride: UpcomingActiveRide): Promise<void> {
    const trafficDelayInSeconds = await this.trafficService.getTrafficDelay(
      ride.originLat,
      ride.originLng,
      ride.destinationLat,
      ride.destinationLng,
    );

    if (
      !shouldNotifyTrafficDelay(
        ride.lastTrafficDelayNotifiedSeconds,
        trafficDelayInSeconds,
      )
    ) {
      return;
    }

    // Conditional UPDATE first — only the call that actually advances the
    // stored delay sends the push. Two concurrent watchers computing the same
    // delta will see exactly one `true` and one `false` here, which is what
    // keeps users from getting duplicate alerts under any cron-overlap or
    // multi-replica scenario.
    const claimed = await this.ridesRepo.claimTrafficDelayNotification(
      this.db,
      ride.id,
      trafficDelayInSeconds,
    );
    if (!claimed) return;

    const acceptedPassengers =
      await this.bookingsRepo.findAcceptedPassengersByRide(this.db, ride.id);
    const userIds = [
      ride.driverId,
      ...acceptedPassengers.map((b) => b.passengerId),
    ];

    const delayMinutes = Math.round(trafficDelayInSeconds / 60);

    await this.notificationsService.sendTrafficAlert(userIds, {
      rideId: ride.id,
      delayMinutes,
      scheduledDeparture: ride.scheduledDeparture,
    });

    this.logger.log(
      `Alert sent for ride ${ride.id}: ${delayMinutes} min delay to ${userIds.length} user(s)`,
    );
  }
}
