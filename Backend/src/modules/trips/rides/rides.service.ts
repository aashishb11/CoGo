import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { fromZonedTime } from 'date-fns-tz';
import { DB, type DbClient } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import {
  throwBadRequest,
  throwInternalServerError,
} from '@shared/errors/throw';
import { DOMAIN_EVENTS } from '@shared/events/event-names';
import type { RideCompletedPayload } from '@shared/events/payloads';
import { WalletService } from '@modules/wallet/wallet.service';
import { BookingsRepository } from '../bookings/bookings.repository';
import { BookingsService } from '../bookings/bookings.service';
import { toBookingResponse } from '../bookings/bookings.mapper';
import type { BookingResponseDto } from '../bookings/dto/bookings-response.dto';
import { TripsRepository } from '../trips/trips.repository';
import { toDriverRecord, type RideStatus } from '../trips.types';
import { CancelRideDto } from './dto/cancel-ride.dto';
import { CompleteRideDto } from './dto/complete-ride.dto';
import { RideListQueryDto } from './dto/ride-list-query.dto';
import { RideSearchQueryDto } from './dto/ride-search-query.dto';
import {
  RideDetailResponseDto,
  RideListResponseDto,
  RideSearchResponseDto,
} from './dto/rides-response.dto';
import { RidesRepository, type EnrichedRideRow } from './rides.repository';
import {
  toRideDetailResponse,
  toRideResponse,
  toRideSearchItem,
} from './rides.mapper';

const TIMEZONE = 'Europe/Madrid';
const KM_PER_DEGREE_LAT = 111;

const DEFAULT_LIST_STATUSES: RideStatus[] = ['active', 'completed'];

// Cancellation reason recorded on rides cancelled by the rides-sweep cron
// for stranded-active rides (driver never started). Stored on
// `rides.cancellation_reason` (free text); reused as the trip-level
// `cancellation_reason` when the cancel cascades trip-archive does not
// fire.
export const DRIVER_NO_SHOW_CANCELLATION_REASON = 'driver_no_show';

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly eventEmitter: EventEmitter2,
    private readonly ridesRepo: RidesRepository,
    private readonly bookingsRepo: BookingsRepository,
    private readonly bookingsService: BookingsService,
    private readonly tripsRepo: TripsRepository,
    private readonly walletService: WalletService,
  ) {}

  async listForTrip(
    tripId: string,
    query: RideListQueryDto,
  ): Promise<RideListResponseDto> {
    if (!(await this.tripsRepo.exists(this.db, tripId))) {
      throw new NotFoundException('Trip not found');
    }

    const statuses = query.status ?? DEFAULT_LIST_STATUSES;
    const fromBound = query.from ?? new Date();

    const rows = await this.ridesRepo.listForTrip(this.db, tripId, {
      statuses,
      fromBound,
      to: query.to,
    });

    const total = rows.length;
    const offset = (query.page - 1) * query.limit;
    const items = rows
      .slice(offset, offset + query.limit)
      .map((r) => toRideResponse(r));

    return { items, page: query.page, limit: query.limit, total };
  }

  async getById(rideId: string): Promise<RideDetailResponseDto> {
    const row = await this.loadEnrichedOrThrow(this.db, rideId);
    return toRideDetailResponse(row.ride, row.trip, toDriverRecord(row), {
      brand: row.carModelBrand,
      name: row.carModelName,
    });
  }

  async search(query: RideSearchQueryDto): Promise<RideSearchResponseDto> {
    const dayStart = fromZonedTime(`${query.date}T00:00:00`, TIMEZONE);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const latRange = query.radiusKm / KM_PER_DEGREE_LAT;
    const cosOriginLat = Math.cos((query.originLat * Math.PI) / 180);
    const cosDestLat = Math.cos((query.destinationLat * Math.PI) / 180);
    // Guard a degenerate cos near the poles; floor at a small positive value.
    const lngOriginRange =
      query.radiusKm /
      (KM_PER_DEGREE_LAT * Math.max(Math.abs(cosOriginLat), 1e-6));
    const lngDestRange =
      query.radiusKm /
      (KM_PER_DEGREE_LAT * Math.max(Math.abs(cosDestLat), 1e-6));

    const rows = await this.ridesRepo.searchByBoundingBox(this.db, {
      date: { dayStart, dayEnd },
      origin: {
        lat: query.originLat,
        lng: query.originLng,
        latRange,
        lngRange: lngOriginRange,
      },
      destination: {
        lat: query.destinationLat,
        lng: query.destinationLng,
        latRange,
        lngRange: lngDestRange,
      },
      seatsNeeded: query.seatsNeeded,
    });

    const total = rows.length;
    const offset = (query.page - 1) * query.limit;
    const items = rows.slice(offset, offset + query.limit).map((row) =>
      toRideSearchItem(row.ride, row.trip, toDriverRecord(row), {
        brand: row.carModelBrand,
        name: row.carModelName,
      }),
    );

    return { items, page: query.page, limit: query.limit, total };
  }

  async cancel(
    driverId: string,
    rideId: string,
    body: CancelRideDto,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const ride = await this.ridesRepo.findById(tx, rideId);
      if (!ride) {
        throw new NotFoundException('Ride not found');
      }

      await this.assertIsTripDriver(tx, ride.tripId, driverId);

      // Reject once the ride is in_progress (or any non-active state):
      // capture has already happened (or is about to), cancelling here
      // would leave the wallet ledger inconsistent.
      if (ride.status !== 'active') {
        if (ride.status === 'in_progress') {
          throwBadRequest(
            'RIDE_ALREADY_STARTED',
            'Ride cannot be cancelled once it is in progress',
          );
        }
        throwBadRequest(
          'RIDE_ALREADY_STARTED',
          `Ride cannot be cancelled (status: ${ride.status})`,
        );
      }

      await this.ridesRepo.cancelMany(
        tx,
        [rideId],
        body.cancellationReason ?? null,
      );

      // Funnel each affected booking through the resolution seam so any
      // active hold is released. This replaces the bulk
      // `bookingsRepo.rejectActiveInRides` which would otherwise strand
      // holds — see plan §US-03 / §Per-story notes.
      const targets = await this.bookingsRepo.findActiveByRides(tx, [rideId]);
      for (const t of targets) {
        await this.bookingsService.markBookingResolved(tx, t.id, 'rejected');
      }

      if (!(await this.ridesRepo.hasFutureActive(tx, ride.tripId))) {
        await this.tripsRepo.archiveIfActive(tx, ride.tripId);
      }

      this.logger.log(
        `Cancelled ride ${rideId} on trip ${ride.tripId} (driver ${driverId})`,
      );
    });
  }

  /**
   * Driver starts the ride. Window: `−30 min … +2 h` around
   * `scheduled_departure`. Outside the window → 400 with a precise code.
   * Wrong status → 409 `RIDE_ALREADY_STARTED`.
   */
  async start(
    driverId: string,
    rideId: string,
  ): Promise<RideDetailResponseDto> {
    await this.db.transaction(async (tx) => {
      const locked = await this.ridesRepo.lockForUpdate(tx, rideId);
      if (!locked) {
        throw new NotFoundException('Ride not found');
      }
      await this.assertIsTripDriver(tx, locked.tripId, driverId);

      if (locked.status !== 'active') {
        throwBadRequest(
          'RIDE_ALREADY_STARTED',
          `Ride cannot be started from status ${locked.status}`,
        );
      }

      const now = new Date();
      const windowStart = new Date(
        locked.scheduledDeparture.getTime() - 30 * 60 * 1000,
      );
      const windowEnd = new Date(
        locked.scheduledDeparture.getTime() + 2 * 60 * 60 * 1000,
      );
      if (now < windowStart || now > windowEnd) {
        throwBadRequest(
          'RIDE_NOT_DEPARTED',
          'Ride can only be started between 30 minutes before and 2 hours after the scheduled departure',
          {
            scheduledDeparture: locked.scheduledDeparture,
            windowStart,
            windowEnd,
          },
        );
      }

      await this.ridesRepo.markStarted(tx, rideId);
    });

    return this.getById(rideId);
  }

  async complete(
    driverId: string,
    rideId: string,
    body: CompleteRideDto,
  ): Promise<RideDetailResponseDto> {
    const result = await this.db.transaction(async (tx) => {
      const locked = await this.ridesRepo.lockForUpdate(tx, rideId);

      if (!locked) {
        throw new NotFoundException('Ride not found');
      }

      await this.assertIsTripDriver(tx, locked.tripId, driverId);

      if (locked.status !== 'active' && locked.status !== 'in_progress') {
        throw new ConflictException('Ride is not active');
      }
      if (
        locked.scheduledDeparture > new Date() &&
        locked.status === 'active'
      ) {
        // Pre-departure complete on an `active` ride still requires the
        // ride to have departed, matching the old contract. (Once
        // `in_progress`, this guard relaxes — the driver has demonstrated
        // departure by starting the ride.)
        throwBadRequest(
          'RIDE_NOT_DEPARTED',
          'Ride cannot be completed before its scheduled departure',
        );
      }

      const settlement = await this.settleAndComplete(tx, rideId, {
        unscannedOutcomes: body.unscannedOutcomes ?? [],
      });

      this.logger.log(
        `Completed ride ${rideId} on trip ${locked.tripId} actualCo2SavedKg=${settlement.actualCo2SavedKg}`,
      );

      const enriched = await this.loadEnrichedOrThrow(tx, rideId);
      return {
        response: toRideDetailResponse(
          enriched.ride,
          enriched.trip,
          toDriverRecord(enriched),
          { brand: enriched.carModelBrand, name: enriched.carModelName },
        ),
        eventPayload: {
          rideId,
          driverId,
          recipientUserIds: settlement.recipientUserIds,
          actualCo2SavedKg: settlement.actualCo2SavedKg,
        } satisfies RideCompletedPayload,
      };
    });

    // post-commit: emit only after the tx succeeded so a rolled-back complete
    // never fires the event. Must remain outside `db.transaction(...)`.
    this.eventEmitter.emit(DOMAIN_EVENTS.RIDE_COMPLETED, result.eventPayload);

    return result.response;
  }

  /**
   * Per-passenger settlement loop + ride-status flip + CO2 freeze.
   * Designed to be reusable by the upcoming rides-sweep cron (idle
   * in-progress rides → default no-show capture; pass `[]` for
   * `unscannedOutcomes`).
   *
   * Caller is responsible for the status guard and ride lock; this method
   * assumes both. Returns the data needed to emit the post-commit
   * `RIDE_COMPLETED` event.
   */
  async settleAndComplete(
    tx: DbClient,
    rideId: string,
    options: {
      unscannedOutcomes: { bookingId: string; outcome: 'boarded' | 'refund' }[];
    },
  ): Promise<{
    actualCo2SavedKg: number;
    seatsOccupied: number;
    recipientUserIds: string[];
    driverId: string;
    capturedCount: number;
    refundedCount: number;
  }> {
    const ride = await this.ridesRepo.findById(tx, rideId);
    if (!ride) {
      // Defensive: caller normally locks the ride first; this branch only
      // hits when the cron race-loses to a manual completion.
      throw new NotFoundException('Ride not found');
    }

    const overrideByBookingId = new Map(
      options.unscannedOutcomes.map((o) => [o.bookingId, o.outcome]),
    );

    const acceptedBookings = await this.bookingsRepo.listByRide(tx, rideId);
    const now = new Date();

    let boardedCount = 0;
    let capturedCount = 0;
    let refundedCount = 0;
    for (const bk of acceptedBookings) {
      if (bk.status !== 'accepted') continue;

      if (bk.boardedAt !== null) {
        // Already scanned (and captured) at boarding.
        boardedCount += 1;
        capturedCount += 1;
        continue;
      }

      const override = overrideByBookingId.get(bk.id);
      if (override === 'boarded') {
        await this.walletService.captureHold(tx, bk.id);
        await this.bookingsRepo.markBoardedIfUnboarded(tx, bk.id);
        boardedCount += 1;
        capturedCount += 1;
        continue;
      }
      if (override === 'refund') {
        await this.walletService.releaseHold(tx, bk.id);
        // boarded_at stays null (passenger did not board).
        refundedCount += 1;
        continue;
      }

      // No override: default rule.
      if (now >= ride.scheduledDeparture) {
        // Post-departure no-show: charge them (boarded_at stays null,
        // distinguishing this from a normal boarding).
        await this.walletService.captureHold(tx, bk.id);
        capturedCount += 1;
      } else {
        // Pre-departure complete (only possible via the in_progress path
        // since active+pre-departure is rejected earlier): refund.
        await this.walletService.releaseHold(tx, bk.id);
        refundedCount += 1;
      }
    }

    const carModelRow = await this.tripsRepo.findCarCo2KgPerKmByTripId(
      tx,
      ride.tripId,
    );
    if (!carModelRow) {
      this.logger.error(
        `Ride ${rideId} cannot resolve car model on completion (data integrity fault)`,
      );
      throwInternalServerError(
        'CAR_MODEL_MISSING',
        'Ride cannot be completed: missing car model',
      );
    }
    const actualCo2SavedKg =
      Math.round(
        boardedCount * ride.totalDistanceKm * carModelRow.co2KgPerKm * 100,
      ) / 100;

    await this.ridesRepo.markCompleted(tx, rideId, {
      seatsOccupied: boardedCount,
      actualCo2SavedKg,
    });

    if (!(await this.ridesRepo.hasFutureActive(tx, ride.tripId))) {
      await this.tripsRepo.archiveIfActive(tx, ride.tripId);
    }

    const driverId = await this.requireDriverId(tx, ride.tripId);
    // Driver + every accepted passenger gets the CO2 credit.
    const recipientUserIds = [
      ...new Set<string>([
        driverId,
        ...acceptedBookings
          .filter((b) => b.status === 'accepted')
          .map((b) => b.passengerId),
      ]),
    ];

    return {
      actualCo2SavedKg,
      seatsOccupied: boardedCount,
      recipientUserIds,
      driverId,
      capturedCount,
      refundedCount,
    };
  }

  /**
   * Per-row entry-point for the rides-sweep cron's "stranded active rides"
   * query. Cancels a never-started `active` ride past its sweep threshold,
   * cascades every non-terminal booking through `markBookingResolved`
   * (`accepted → rejected`, `pending → expired`), and archives the parent
   * trip when no future-active rides remain.
   *
   * Caller is responsible for the status guard. Operates in the supplied
   * `tx` so the cron can swallow per-row errors without aborting other
   * rows in the same pass.
   */
  async expireUnstarted(
    tx: DbClient,
    rideId: string,
  ): Promise<{
    applied: boolean;
    driverId: string | null;
    affectedPassengerIds: string[];
  }> {
    const ride = await this.ridesRepo.findById(tx, rideId);
    if (!ride) {
      // Race with a manual cancel/start; nothing to do.
      return { applied: false, driverId: null, affectedPassengerIds: [] };
    }
    if (ride.status !== 'active' || ride.startedAt !== null) {
      // The ride moved out from under us. The cron query is loose; the
      // tx-level check is the source of truth.
      return { applied: false, driverId: null, affectedPassengerIds: [] };
    }

    await this.ridesRepo.cancelMany(
      tx,
      [rideId],
      DRIVER_NO_SHOW_CANCELLATION_REASON,
    );

    const targets = await this.bookingsRepo.findActiveByRideWithPassenger(
      tx,
      rideId,
    );
    for (const t of targets) {
      const finalStatus = t.status === 'accepted' ? 'rejected' : 'expired';
      await this.bookingsService.markBookingResolved(tx, t.id, finalStatus);
    }

    if (!(await this.ridesRepo.hasFutureActive(tx, ride.tripId))) {
      await this.tripsRepo.archiveIfActive(tx, ride.tripId);
    }

    const driverId = await this.tripsRepo.findDriverId(tx, ride.tripId);

    this.logger.log(
      `Expired unstarted ride ${rideId} on trip ${ride.tripId} (driver no-show); cascaded ${targets.length} booking(s)`,
    );

    return {
      applied: true,
      driverId,
      affectedPassengerIds: [...new Set(targets.map((t) => t.passengerId))],
    };
  }

  private async requireDriverId(tx: DbClient, tripId: string): Promise<string> {
    const driverId = await this.tripsRepo.findDriverId(tx, tripId);
    if (driverId === null) {
      throw new NotFoundException('Trip not found');
    }
    return driverId;
  }

  async listBookings(
    driverId: string,
    rideId: string,
  ): Promise<BookingResponseDto[]> {
    return this.db.transaction(async (tx) => {
      const ride = await this.ridesRepo.findById(tx, rideId);
      if (!ride) {
        throw new NotFoundException('Ride not found');
      }

      await this.assertIsTripDriver(tx, ride.tripId, driverId);

      const rows = await this.bookingsRepo.listByRide(tx, rideId);

      return rows.map((b) =>
        toBookingResponse(b, {
          tripId: ride.tripId,
          scheduledDeparture: ride.scheduledDeparture,
        }),
      );
    });
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async assertIsTripDriver(
    tx: DbClient,
    tripId: string,
    userId: string,
  ): Promise<void> {
    const driverId = await this.tripsRepo.findDriverId(tx, tripId);
    if (driverId === null) {
      throw new NotFoundException('Trip not found');
    }
    if (driverId !== userId) {
      throw new ForbiddenException('You are not the trip driver');
    }
  }

  private async loadEnrichedOrThrow(
    tx: DbClient,
    rideId: string,
  ): Promise<EnrichedRideRow> {
    const row = await this.ridesRepo.findEnriched(tx, rideId);
    if (!row) {
      throw new NotFoundException('Ride not found');
    }
    return row;
  }
}
