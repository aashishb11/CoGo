import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB, type DbClient } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { TrustedContactService } from '@modules/safety/trusted-contact.service';
import { WalletService } from '@modules/wallet/wallet.service';
import { WalletRepository } from '@modules/wallet/wallet.repository';
import { throwBadRequest } from '@shared/errors/throw';
import { ChatRepository } from '../chat/chat.repository';
import { RidesRepository } from '../rides/rides.repository';
import { TripsRepository } from '../trips/trips.repository';
import type { BookingStatus } from '../trips.types';
import { toBookingResponse } from './bookings.mapper';
import {
  BookingsRepository,
  type DriverActionCandidate,
} from './bookings.repository';
import { AcceptBookingsDto } from './dto/accept-bookings.dto';
import { CreateBookingsDto } from './dto/create-bookings.dto';
import {
  BookingsBatchCreatedResponseDto,
  BookingsBatchOutcomeDto,
  type BookingListResponseDto,
  type BookingResponseDto,
  type InboxItemResponseDto,
  type InboxResponseDto,
} from './dto/bookings-response.dto';
import { MeBookingsQueryDto } from './dto/me-bookings-query.dto';
import { MeInboxQueryDto } from './dto/me-inbox-query.dto';
import {
  RejectAllBookingsDto,
  RejectBookingsDto,
} from './dto/reject-bookings.dto';

const TERMINAL_STATUSES: BookingStatus[] = ['rejected', 'cancelled', 'expired'];

// Drizzle wraps Postgres errors in DrizzleQueryError; the original PostgresError
// (with `code` and `constraint_name`) is on `.cause`.
const isUniqueViolation = (err: unknown, constraint: string): boolean => {
  const visit = (e: unknown): boolean => {
    if (typeof e !== 'object' || e === null) {
      return false;
    }
    const obj = e as {
      code?: unknown;
      constraint_name?: unknown;
      cause?: unknown;
    };
    if (obj.code === '23505' && obj.constraint_name === constraint) {
      return true;
    }
    return obj.cause !== undefined && visit(obj.cause);
  };
  return visit(err);
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly bookingsRepo: BookingsRepository,
    private readonly ridesRepo: RidesRepository,
    private readonly tripsRepo: TripsRepository,
    private readonly chatRepo: ChatRepository,
    private readonly trustedContactService: TrustedContactService,
    private readonly walletService: WalletService,
    private readonly walletRepo: WalletRepository,
  ) {}

  /**
   * Single seam through which an `accepted` (or `pending`) booking moves
   * to a non-terminal terminal state (`cancelled` / `rejected` / `expired`).
   * Flips the row and releases the hold via WalletService. `releaseHold`
   * is a no-op when no active hold exists, so funnelling pending bookings
   * (no hold was ever placed) through this method is safe.
   *
   * Idempotent: a second call after the row is already terminal returns
   * `{ applied: false }` and does not touch holds.
   */
  async markBookingResolved(
    tx: DbClient,
    bookingId: string,
    finalStatus: 'cancelled' | 'rejected' | 'expired',
  ): Promise<{ applied: boolean }> {
    const updated = await this.bookingsRepo.resolveOneIfNonTerminal(
      tx,
      bookingId,
      finalStatus,
    );
    if (updated.length === 0) {
      return { applied: false };
    }
    await this.walletService.releaseHold(tx, bookingId);
    return { applied: true };
  }

  // ── Passenger-facing ────────────────────────────────────────────────────

  async createBatch(
    passengerId: string,
    tripId: string,
    body: CreateBookingsDto,
  ): Promise<BookingsBatchCreatedResponseDto> {
    return this.db.transaction(async (tx) => {
      await this.trustedContactService.assertHasContact(tx, passengerId);
      const trip = await this.tripsRepo.findById(tx, tripId);
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }
      if (trip.driverId === passengerId) {
        throw new BadRequestException(
          'Drivers cannot book rides on their own trip',
        );
      }

      // Surface insufficient funds upfront (before persisting any pending
      // bookings). The per-item funds race at driver-accept time is
      // handled separately via `BOOKING_SKIP_REASONS`.
      const passengerWallet = await this.walletService.getOrCreateWallet(
        tx,
        passengerId,
      );
      const availableCents =
        passengerWallet.balanceCents - passengerWallet.heldCents;
      if (availableCents < trip.pricePerSeatCents) {
        throwBadRequest(
          'INSUFFICIENT_WALLET_BALANCE',
          'Wallet balance is below the per-seat fare for this trip',
          {
            availableCents,
            pricePerSeatCents: trip.pricePerSeatCents,
            shortfallCents: trip.pricePerSeatCents - availableCents,
          },
        );
      }

      const requested = [...new Set(body.rideIds)];
      const rideRows = await this.ridesRepo.findByIds(tx, requested);

      const byId = new Map(rideRows.map((r) => [r.id, r]));
      const now = new Date();
      for (const rideId of requested) {
        const ride = byId.get(rideId);
        if (!ride) {
          throw new BadRequestException(
            `Ride ${rideId} not found on trip ${tripId}`,
          );
        }
        if (ride.tripId !== tripId) {
          throw new BadRequestException(
            `Ride ${rideId} does not belong to trip ${tripId}`,
          );
        }
        if (ride.status !== 'active') {
          throw new BadRequestException(`Ride ${rideId} is not active`);
        }
        if (ride.scheduledDeparture <= now) {
          throw new BadRequestException(`Ride ${rideId} has already departed`);
        }
      }

      const rows = requested.map((rideId) => ({
        id: randomUUID(),
        passengerId,
        rideId,
        status: 'pending' as const,
        message: body.message ?? null,
      }));

      let inserted;
      try {
        inserted = await this.bookingsRepo.insertMany(tx, rows);
      } catch (err) {
        if (isUniqueViolation(err, 'bookings_passenger_ride_active_uq')) {
          throw new ConflictException(
            'Active booking already exists for one of the requested rides',
          );
        }
        throw err;
      }

      // Ensure a chat thread exists for this (trip, passenger) pair.
      // ON CONFLICT DO NOTHING makes this idempotent — subsequent bookings on
      // the same trip reuse the existing thread.
      await this.chatRepo.upsertThread(tx, {
        id: randomUUID(),
        tripId,
        passengerId,
      });

      const items = inserted.map((b) => {
        const ride = byId.get(b.rideId)!;
        return toBookingResponse(b, {
          tripId: ride.tripId,
          scheduledDeparture: ride.scheduledDeparture,
        });
      });
      return { items };
    });
  }

  async listMine(
    passengerId: string,
    query: MeBookingsQueryDto,
  ): Promise<BookingListResponseDto> {
    const rows = await this.bookingsRepo.listMine(this.db, passengerId, {
      tripId: query.tripId,
      status: query.status,
      from: query.from,
      to: query.to,
    });

    const total = rows.length;
    const offset = (query.page - 1) * query.limit;
    const items = rows.slice(offset, offset + query.limit).map((row) =>
      toBookingResponse(row.booking, {
        tripId: row.ride.tripId,
        scheduledDeparture: row.ride.scheduledDeparture,
      }),
    );

    return { items, page: query.page, limit: query.limit, total };
  }

  async getOne(
    requesterId: string,
    bookingId: string,
  ): Promise<BookingResponseDto> {
    const row = await this.bookingsRepo.findByIdWithRideAndTrip(
      this.db,
      bookingId,
    );

    if (!row) {
      throw new NotFoundException('Booking not found');
    }

    const isPassenger = row.booking.passengerId === requesterId;
    const isDriver = row.trip.driverId === requesterId;
    if (!isPassenger && !isDriver) {
      throw new ForbiddenException('Not allowed to view this booking');
    }

    return toBookingResponse(row.booking, {
      tripId: row.ride.tripId,
      scheduledDeparture: row.ride.scheduledDeparture,
    });
  }

  async cancelOne(passengerId: string, bookingId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await this.bookingsRepo.findByIdWithRideAndTrip(
        tx,
        bookingId,
      );

      if (!row) {
        throw new NotFoundException('Booking not found');
      }
      if (row.booking.passengerId !== passengerId) {
        throw new ForbiddenException('Not allowed to cancel this booking');
      }

      // Refuse once the ride is in_progress or completed: capture has
      // already happened (or is about to), so cancellation is not allowed.
      if (
        row.ride.status === 'in_progress' ||
        row.ride.status === 'completed'
      ) {
        throwBadRequest(
          'RIDE_ALREADY_STARTED',
          'Booking cannot be cancelled after the ride has started',
        );
      }

      // Idempotent: if already terminal, return 204 without touching state.
      if (TERMINAL_STATUSES.includes(row.booking.status)) {
        return;
      }

      const wasAccepted = row.booking.status === 'accepted';

      const { applied } = await this.markBookingResolved(
        tx,
        bookingId,
        'cancelled',
      );
      if (!applied) {
        // Lost a race; another tx already moved this booking to terminal.
        return;
      }

      if (wasAccepted) {
        await this.ridesRepo.applySeatChange(tx, row.booking.rideId, -1);
      }
    });
  }

  async cancelMineOnTrip(passengerId: string, tripId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const myActive = await this.bookingsRepo.findActiveByPassengerOnTrip(
        tx,
        passengerId,
        tripId,
      );

      if (myActive.length === 0) {
        return;
      }

      // Refuse if any of these rides is in_progress or completed; passengers
      // cannot cancel after the ride starts.
      const rideIds = [...new Set(myActive.map((b) => b.rideId))];
      const rideRows = await this.ridesRepo.findByIds(tx, rideIds);
      for (const ride of rideRows) {
        if (ride.status === 'in_progress' || ride.status === 'completed') {
          throwBadRequest(
            'RIDE_ALREADY_STARTED',
            'Bookings cannot be cancelled once any of their rides has started',
          );
        }
      }

      for (const bk of myActive) {
        const wasAccepted = bk.status === 'accepted';
        const { applied } = await this.markBookingResolved(
          tx,
          bk.id,
          'cancelled',
        );
        if (applied && wasAccepted) {
          await this.ridesRepo.applySeatChange(tx, bk.rideId, -1);
        }
      }
    });
  }

  // ── Driver-facing ───────────────────────────────────────────────────────

  async listMyInbox(
    driverId: string,
    query: MeInboxQueryDto,
  ): Promise<InboxResponseDto> {
    const rows = await this.bookingsRepo.findInbox(this.db, driverId, {
      tripId: query.tripId,
      passengerId: query.passengerId,
    });

    type Bucket = {
      tripId: string;
      trip: InboxItemResponseDto['trip'];
      passenger: InboxItemResponseDto['passenger'];
      bookings: BookingResponseDto[];
      pendingCount: number;
      acceptedCount: number;
      oldestPendingAt: Date | null;
    };

    const grouped = new Map<string, Bucket>();
    for (const row of rows) {
      const key = `${row.trip.id}::${row.booking.passengerId}`;
      let bucket = grouped.get(key);
      if (!bucket) {
        bucket = {
          tripId: row.trip.id,
          trip: {
            originLabel: row.trip.originLabel,
            destinationLabel: row.trip.destinationLabel,
            type: row.trip.type,
          },
          passenger: {
            id: row.booking.passengerId,
            name: row.passengerName,
            avatar: row.passengerImage,
          },
          bookings: [],
          pendingCount: 0,
          acceptedCount: 0,
          oldestPendingAt: null,
        };
        grouped.set(key, bucket);
      }

      bucket.bookings.push(
        toBookingResponse(row.booking, {
          tripId: row.ride.tripId,
          scheduledDeparture: row.ride.scheduledDeparture,
        }),
      );
      if (row.booking.status === 'pending') {
        bucket.pendingCount += 1;
        if (
          bucket.oldestPendingAt === null ||
          row.booking.requestedAt < bucket.oldestPendingAt
        ) {
          bucket.oldestPendingAt = row.booking.requestedAt;
        }
      } else if (row.booking.status === 'accepted') {
        bucket.acceptedCount += 1;
      }
    }

    // Pending-first (oldest at the top of action items), then accepted-only
    // batches as reference state. Within either group, ASC time order.
    const sorted = [...grouped.values()].sort((a, b) => {
      if (a.oldestPendingAt && b.oldestPendingAt) {
        return a.oldestPendingAt.getTime() - b.oldestPendingAt.getTime();
      }
      if (a.oldestPendingAt) return -1;
      if (b.oldestPendingAt) return 1;
      return 0;
    });

    const total = sorted.length;
    const offset = (query.page - 1) * query.limit;
    const items = sorted.slice(offset, offset + query.limit);

    return { items, page: query.page, limit: query.limit, total };
  }

  async accept(
    driverId: string,
    tripId: string,
    passengerId: string,
    body: AcceptBookingsDto,
  ): Promise<BookingsBatchOutcomeDto> {
    return this.db.transaction(async (tx) => {
      await this.assertIsTripDriver(tx, tripId, driverId);

      // Read the trip price once at the top of the accept tx so per-booking
      // freezes copy a consistent value. Driver edits to the price between
      // request and accept are picked up here, which matches the plan's
      // "frozen on accept" rule.
      const trip = await this.tripsRepo.findById(tx, tripId);
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }
      const fareCents = trip.pricePerSeatCents;

      const candidates = await this.loadDriverActionCandidates(
        tx,
        tripId,
        passengerId,
        body.bookingIds,
      );
      const accepted: string[] = [];
      const skipped: BookingsBatchOutcomeDto['skipped'] = [];

      const now = new Date();
      for (const bk of candidates) {
        if (bk.status !== 'pending') {
          skipped.push({ id: bk.id, reason: 'ALREADY_TERMINAL' });
          continue;
        }

        const ride = await this.ridesRepo.lockForUpdate(tx, bk.rideId);

        // Ride departed, cancelled, or completed all collapse to RIDE_DEPARTED
        // for the FE: the ride is no longer bookable, action is the same.
        if (
          !ride ||
          ride.status !== 'active' ||
          ride.scheduledDeparture <= now
        ) {
          skipped.push({ id: bk.id, reason: 'RIDE_DEPARTED' });
          continue;
        }
        if (ride.seatsOccupied >= ride.seatsOffered) {
          skipped.push({ id: bk.id, reason: 'RIDE_FULL' });
          continue;
        }

        // Funds race: another tx may have drained the passenger's wallet
        // since createBatch validated balance. Check inside the lock and
        // skip this item with INSUFFICIENT_WALLET_BALANCE if so. The
        // booking stays pending — driver can retry later (or once the
        // passenger tops up).
        const passengerWallet = await this.walletRepo.findByUserIdForUpdate(
          tx,
          passengerId,
        );
        const passengerAvailable = passengerWallet
          ? passengerWallet.balanceCents - passengerWallet.heldCents
          : 0;
        if (passengerAvailable < fareCents) {
          skipped.push({ id: bk.id, reason: 'INSUFFICIENT_WALLET_BALANCE' });
          continue;
        }

        await this.bookingsRepo.acceptOneIfPending(tx, bk.id);
        await this.bookingsRepo.setFareCents(tx, bk.id, fareCents);
        await this.walletService.placeHold(tx, passengerId, bk.id, fareCents);
        await this.ridesRepo.applySeatChange(tx, ride.id, 1);
        accepted.push(bk.id);
      }

      return { accepted, skipped };
    });
  }

  async reject(
    driverId: string,
    tripId: string,
    passengerId: string,
    body: RejectBookingsDto,
  ): Promise<BookingsBatchOutcomeDto> {
    return this.db.transaction(async (tx) => {
      await this.assertIsTripDriver(tx, tripId, driverId);

      const candidates = await this.loadDriverActionCandidates(
        tx,
        tripId,
        passengerId,
        body.bookingIds,
      );
      const rejected: string[] = [];
      const skipped: BookingsBatchOutcomeDto['skipped'] = [];

      for (const bk of candidates) {
        if (bk.status !== 'pending' && bk.status !== 'accepted') {
          skipped.push({ id: bk.id, reason: 'ALREADY_TERMINAL' });
          continue;
        }

        const ride = await this.ridesRepo.lockForUpdate(tx, bk.rideId);

        const wasAccepted = bk.status === 'accepted';

        await this.markBookingResolved(tx, bk.id, 'rejected');
        if (wasAccepted && ride && ride.status === 'active') {
          await this.ridesRepo.applySeatChange(tx, ride.id, -1);
        }
        rejected.push(bk.id);
      }

      if (body.rejectionReason) {
        this.logger.log(
          `Driver ${driverId} rejected ${rejected.length} booking(s) on trip ${tripId} (reason discarded — no column)`,
        );
      }

      return { accepted: rejected, skipped };
    });
  }

  async rejectAll(
    driverId: string,
    tripId: string,
    body: RejectAllBookingsDto,
  ): Promise<BookingsBatchOutcomeDto> {
    return this.db.transaction(async (tx) => {
      await this.assertIsTripDriver(tx, tripId, driverId);

      const futureRides = await this.ridesRepo.findFutureActiveByTrip(
        tx,
        tripId,
      );
      if (futureRides.length === 0) {
        return { accepted: [], skipped: [] };
      }

      const futureIds = futureRides.map((r) => r.id);
      const targets = await this.bookingsRepo.findActiveByRides(tx, futureIds);

      if (targets.length === 0) {
        return { accepted: [], skipped: [] };
      }

      const acceptedRideIds = targets
        .filter((b) => b.status === 'accepted')
        .map((b) => b.rideId);

      for (const t of targets) {
        await this.markBookingResolved(tx, t.id, 'rejected');
      }

      for (const rideId of acceptedRideIds) {
        await this.ridesRepo.applySeatChange(tx, rideId, -1);
      }

      if (body.rejectionReason) {
        this.logger.log(
          `Driver ${driverId} reject-all on trip ${tripId} (reason discarded — no column)`,
        );
      }

      return { accepted: targets.map((t) => t.id), skipped: [] };
    });
  }

  // ── private helpers ─────────────────────────────────────────────────────

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

  private async loadDriverActionCandidates(
    tx: DbClient,
    tripId: string,
    passengerId: string,
    bookingIds: string[] | undefined,
  ): Promise<DriverActionCandidate[]> {
    const rows = await this.bookingsRepo.findDriverActionCandidates(
      tx,
      tripId,
      passengerId,
      bookingIds,
    );

    if (bookingIds && bookingIds.length > 0) {
      const found = new Set(rows.map((r) => r.id));
      const missing = bookingIds.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new NotFoundException(
          `Booking ${missing[0]} not found for this passenger on this trip`,
        );
      }
    }

    return rows;
  }
}
