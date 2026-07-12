import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { DOMAIN_EVENTS } from '@shared/events/event-names';
import type { RideCompletedPayload } from '@shared/events/payloads';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { WalletService } from '@modules/wallet/wallet.service';
import { WalletRepository } from '@modules/wallet/wallet.repository';
import { RidesRepository } from './rides.repository';
import { RidesService } from './rides.service';

// Thresholds (in minutes) for the cron's two ride-side queries. Symmetric:
// "more than 6h in the wrong state" for both idle-in-progress and
// stranded-active. Hourly cron tick keeps the lag bounded to ≤ 6h + 1h.
export const IDLE_IN_PROGRESS_THRESHOLD_MINUTES = 6 * 60;
export const STRANDED_ACTIVE_THRESHOLD_MINUTES = 6 * 60;

@Injectable()
export class RidesSweepService {
  private readonly logger = new Logger(RidesSweepService.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly ridesRepo: RidesRepository,
    private readonly walletRepo: WalletRepository,
    private readonly ridesService: RidesService,
    private readonly walletService: WalletService,
    private readonly notifications: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Hourly tick covering three ride-lifecycle backstops:
   *  1. Idle in-progress rides → auto-complete via `settleAndComplete([])`.
   *  2. Stranded active rides (driver no-show) → cancel + cascade via
   *     `expireUnstarted`.
   *  3. Orphan-hold backstop → `releaseHold` + `logger.error` (indicates a
   *     missed cancellation seam upstream, not a routine cleanup).
   *
   * Each row processed in its own transaction; per-row errors are
   * swallowed and logged so a single bad row never aborts the pass.
   * Schedule offset by one minute from `BookingsExpiryService` (which runs
   * every 15 minutes on the quarter-hour) so the two crons don't fight for
   * the same connection at the top of the hour.
   */
  @Cron('1 * * * *')
  async sweep(): Promise<{
    completed: number;
    cancelled: number;
    orphanHoldsReleased: number;
  }> {
    const completed = await this.sweepIdleInProgress();
    const cancelled = await this.sweepStrandedActive();
    const orphanHoldsReleased = await this.sweepOrphanHolds();
    this.logger.log(
      `rides-sweep: completed=${completed} cancelled=${cancelled} orphanHoldsReleased=${orphanHoldsReleased}`,
    );
    return { completed, cancelled, orphanHoldsReleased };
  }

  // ── Query 1: idle in-progress ────────────────────────────────────────

  private async sweepIdleInProgress(): Promise<number> {
    let ids: string[];
    try {
      ids = await this.ridesRepo.findIdleInProgress(
        this.db,
        IDLE_IN_PROGRESS_THRESHOLD_MINUTES,
      );
    } catch (err) {
      this.logger.error('rides-sweep: findIdleInProgress failed', err);
      return 0;
    }
    let completed = 0;
    for (const rideId of ids) {
      try {
        const summary = await this.db.transaction(async (tx) =>
          this.ridesService.settleAndComplete(tx, rideId, {
            unscannedOutcomes: [],
          }),
        );
        // post-commit: mirror the driver-initiated complete path
        // (`RidesService.complete`) so XP / CO2 / rides counters / badges
        // are awarded for cron auto-completions too.
        this.eventEmitter.emit(DOMAIN_EVENTS.RIDE_COMPLETED, {
          rideId,
          driverId: summary.driverId,
          recipientUserIds: summary.recipientUserIds,
          actualCo2SavedKg: summary.actualCo2SavedKg,
        } satisfies RideCompletedPayload);
        await this.notifications
          .sendRideAutoCompleted(summary.driverId, {
            rideId,
            capturedCount: summary.capturedCount,
            refundedCount: summary.refundedCount,
          })
          .catch((err: unknown) => {
            this.logger.error(
              `rides-sweep: notify ride.auto_completed failed for ride ${rideId}`,
              err,
            );
          });
        completed += 1;
      } catch (err) {
        this.logger.error(
          `rides-sweep: settleAndComplete failed for ride ${rideId}`,
          err,
        );
      }
    }
    return completed;
  }

  // ── Query 2: stranded active ─────────────────────────────────────────

  private async sweepStrandedActive(): Promise<number> {
    let ids: string[];
    try {
      ids = await this.ridesRepo.findStrandedActive(
        this.db,
        STRANDED_ACTIVE_THRESHOLD_MINUTES,
      );
    } catch (err) {
      this.logger.error('rides-sweep: findStrandedActive failed', err);
      return 0;
    }
    let cancelled = 0;
    for (const rideId of ids) {
      try {
        const result = await this.db.transaction(async (tx) =>
          this.ridesService.expireUnstarted(tx, rideId),
        );
        if (!result.applied) {
          continue;
        }
        cancelled += 1;
        if (result.driverId) {
          await this.notifications
            .sendRideDriverNoShow(result.driverId, { rideId })
            .catch((err: unknown) => {
              this.logger.error(
                `rides-sweep: notify ride.driver_no_show failed for ride ${rideId}`,
                err,
              );
            });
        }
        if (result.affectedPassengerIds.length > 0) {
          await this.notifications
            .sendRideAutoCancelled(result.affectedPassengerIds, { rideId })
            .catch((err: unknown) => {
              this.logger.error(
                `rides-sweep: notify ride.auto_cancelled failed for ride ${rideId}`,
                err,
              );
            });
        }
      } catch (err) {
        this.logger.error(
          `rides-sweep: expireUnstarted failed for ride ${rideId}`,
          err,
        );
      }
    }
    return cancelled;
  }

  // ── Query 3: orphan-hold backstop ────────────────────────────────────

  private async sweepOrphanHolds(): Promise<number> {
    let rows: { holdId: string; bookingId: string }[];
    try {
      rows = await this.walletRepo.findActiveHoldsOnTerminalBookings(this.db);
    } catch (err) {
      this.logger.error(
        'rides-sweep: findActiveHoldsOnTerminalBookings failed',
        err,
      );
      return 0;
    }
    let released = 0;
    for (const row of rows) {
      try {
        const result = await this.db.transaction(async (tx) =>
          this.walletService.releaseHold(tx, row.bookingId),
        );
        if (result.released) {
          released += 1;
          // The plan is explicit: a hit indicates a missed cancellation
          // seam upstream. Surface it as a bug — do not silently auto-heal.
          this.logger.error(
            'orphan hold released — missed cancellation seam upstream',
            { bookingId: row.bookingId, holdId: row.holdId },
          );
        }
      } catch (err) {
        this.logger.error(
          `rides-sweep: releaseHold failed for booking ${row.bookingId}`,
          err,
        );
      }
    }
    return released;
  }
}
