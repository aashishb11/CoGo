import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { inArray, sql, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { profile } from '@core/database/schema';
import type { ProfileBadge } from '@core/database/schema/profile.schema';
import { DOMAIN_EVENTS } from '@shared/events/event-names';
import type { RideCompletedPayload } from '@shared/events/payloads';
import { calcRideXp, computeNewBadges } from './domain/gamification';

@Injectable()
export class ProfileRideCompletedSubscriberService {
  private readonly logger = new Logger(
    ProfileRideCompletedSubscriberService.name,
  );

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  @OnEvent(DOMAIN_EVENTS.RIDE_COMPLETED, { async: true })
  async handleRideCompleted(payload: RideCompletedPayload): Promise<void> {
    const { rideId, recipientUserIds, actualCo2SavedKg, driverId } = payload;
    try {
      const uniqueRecipients = [...new Set(recipientUserIds)];
      if (uniqueRecipients.length === 0) {
        return;
      }

      await this.db.transaction(async (tx) => {
        // Lock rows for update to prevent concurrent race condition on jsonb badges read/write
        const rows = await tx
          .select({
            userId: profile.userId,
            totalCo2Saved: profile.totalCo2Saved,
            xpPoints: profile.xpPoints,
            ridesAsDriver: profile.ridesAsDriver,
            ridesAsPassenger: profile.ridesAsPassenger,
            badges: profile.badges,
          })
          .from(profile)
          .where(inArray(profile.userId, uniqueRecipients))
          .for('update');

        if (rows.length === 0) {
          return;
        }

        // Sequential: postgres-js serializes statements on the tx's single
        // connection, so a parallel `Promise.all` here would not actually run
        // in parallel and only obscures intent.
        for (const row of rows) {
          const role = row.userId === driverId ? 'driver' : 'passenger';
          const xpGained = calcRideXp(role, actualCo2SavedKg);

          // Calculate 'after' state in memory for badge evaluation
          const xpAfter = row.xpPoints + xpGained;
          const co2After = row.totalCo2Saved + actualCo2SavedKg;
          const driverRidesAfter =
            row.ridesAsDriver + (role === 'driver' ? 1 : 0);
          const passengerRidesAfter =
            row.ridesAsPassenger + (role === 'passenger' ? 1 : 0);
          const totalRidesAfter = driverRidesAfter + passengerRidesAfter;

          const existingIds = new Set((row.badges ?? []).map((b) => b.id));
          const newBadgeIds = computeNewBadges({
            roleThisRide: role,
            totalCo2SavedAfter: co2After,
            xpPointsAfter: xpAfter,
            totalRidesAfter,
            existingBadgeIds: existingIds,
          });

          const newBadges: ProfileBadge[] = newBadgeIds.map((id) => ({
            id,
            awardedAt: new Date().toISOString(),
          }));

          const updatedBadges: ProfileBadge[] = [
            ...(row.badges ?? []),
            ...newBadges,
          ];

          await tx
            .update(profile)
            .set({
              xpPoints: sql`${profile.xpPoints} + ${xpGained}`,
              totalCo2Saved: sql`${profile.totalCo2Saved} + ${actualCo2SavedKg}`,
              ridesAsDriver:
                role === 'driver'
                  ? sql`${profile.ridesAsDriver} + 1`
                  : profile.ridesAsDriver,
              ridesAsPassenger:
                role === 'passenger'
                  ? sql`${profile.ridesAsPassenger} + 1`
                  : profile.ridesAsPassenger,
              badges: updatedBadges,
            })
            .where(eq(profile.userId, row.userId));
        }
      });

      this.logger.debug(
        `profile-ride-completed-subscriber rideId=${rideId} processed recipients=${uniqueRecipients.length}`,
      );
    } catch (err) {
      this.logger.error(
        `profile-ride-completed-subscriber failed for rideId=${rideId}`,
        err,
      );
    }
  }
}
