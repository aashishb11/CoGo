import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import { bookings, rides, trips, user } from '@core/database/schema';
import type { Booking } from '@core/database/schema/bookings.schema';
import type { Ride } from '@core/database/schema/rides.schema';
import type { Trip } from '@core/database/schema/trips.schema';
import type { BookingStatus } from '../trips.types';

type InsertBooking = typeof bookings.$inferInsert;

const NON_TERMINAL_STATUSES: BookingStatus[] = ['pending', 'accepted'];

export type BookingWithRide = { booking: Booking; ride: Ride };
export type BookingWithRideAndTrip = BookingWithRide & { trip: Trip };

export type DriverActionCandidate = Pick<Booking, 'id' | 'rideId' | 'status'>;

export type InboxRow = {
  booking: Booking;
  ride: Ride;
  trip: Trip;
  passengerName: string;
  passengerImage: string | null;
};

export type ListMineFilters = {
  tripId?: string;
  status?: BookingStatus[];
  from?: Date;
  to?: Date;
};

export type InboxFilters = {
  tripId?: string;
  passengerId?: string;
};

@Injectable()
export class BookingsRepository {
  async findById(tx: DbClient, bookingId: string): Promise<Booking | null> {
    const [row] = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    return row ?? null;
  }

  async findByIdWithRideAndTrip(
    tx: DbClient,
    bookingId: string,
  ): Promise<BookingWithRideAndTrip | null> {
    const [row] = await tx
      .select({ booking: bookings, ride: rides, trip: trips })
      .from(bookings)
      .innerJoin(rides, eq(bookings.rideId, rides.id))
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);
    return row ?? null;
  }

  async listByRide(tx: DbClient, rideId: string): Promise<Booking[]> {
    return tx
      .select()
      .from(bookings)
      .where(eq(bookings.rideId, rideId))
      .orderBy(asc(bookings.requestedAt));
  }

  async findAcceptedPassengersByRide(
    tx: DbClient,
    rideId: string,
  ): Promise<{ passengerId: string }[]> {
    return tx
      .select({ passengerId: bookings.passengerId })
      .from(bookings)
      .where(and(eq(bookings.rideId, rideId), eq(bookings.status, 'accepted')));
  }

  async findActiveByPassengerOnTrip(
    tx: DbClient,
    passengerId: string,
    tripId: string,
  ): Promise<DriverActionCandidate[]> {
    return tx
      .select({
        id: bookings.id,
        rideId: bookings.rideId,
        status: bookings.status,
      })
      .from(bookings)
      .innerJoin(rides, eq(bookings.rideId, rides.id))
      .where(
        and(
          eq(bookings.passengerId, passengerId),
          eq(rides.tripId, tripId),
          inArray(bookings.status, NON_TERMINAL_STATUSES),
        ),
      );
  }

  async findDriverActionCandidates(
    tx: DbClient,
    tripId: string,
    passengerId: string,
    bookingIds?: string[],
  ): Promise<DriverActionCandidate[]> {
    const conditions = [
      eq(bookings.passengerId, passengerId),
      eq(rides.tripId, tripId),
    ];
    if (bookingIds && bookingIds.length > 0) {
      conditions.push(inArray(bookings.id, bookingIds));
    }
    return tx
      .select({
        id: bookings.id,
        rideId: bookings.rideId,
        status: bookings.status,
      })
      .from(bookings)
      .innerJoin(rides, eq(bookings.rideId, rides.id))
      .where(and(...conditions));
  }

  async findActiveByRides(
    tx: DbClient,
    rideIds: string[],
  ): Promise<DriverActionCandidate[]> {
    if (rideIds.length === 0) {
      return [];
    }
    return tx
      .select({
        id: bookings.id,
        rideId: bookings.rideId,
        status: bookings.status,
      })
      .from(bookings)
      .where(
        and(
          inArray(bookings.rideId, rideIds),
          inArray(bookings.status, NON_TERMINAL_STATUSES),
        ),
      );
  }

  /**
   * Like `findActiveByRides` but also returns the passenger id. Used by
   * the rides-sweep cron's stranded-active branch to fan out a
   * notification to each affected passenger after the cancel cascade
   * commits.
   */
  async findActiveByRideWithPassenger(
    tx: DbClient,
    rideId: string,
  ): Promise<
    Array<{
      id: string;
      passengerId: string;
      status: BookingStatus;
    }>
  > {
    return tx
      .select({
        id: bookings.id,
        passengerId: bookings.passengerId,
        status: bookings.status,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.rideId, rideId),
          inArray(bookings.status, NON_TERMINAL_STATUSES),
        ),
      );
  }

  async listMine(
    tx: DbClient,
    passengerId: string,
    filters: ListMineFilters,
  ): Promise<BookingWithRide[]> {
    const conditions = [eq(bookings.passengerId, passengerId)];
    if (filters.tripId) {
      conditions.push(eq(rides.tripId, filters.tripId));
    }
    if (filters.status && filters.status.length > 0) {
      conditions.push(inArray(bookings.status, filters.status));
    }
    if (filters.from) {
      conditions.push(gte(rides.scheduledDeparture, filters.from));
    }
    if (filters.to) {
      conditions.push(lt(rides.scheduledDeparture, filters.to));
    }
    return tx
      .select({ booking: bookings, ride: rides })
      .from(bookings)
      .innerJoin(rides, eq(bookings.rideId, rides.id))
      .where(and(...conditions))
      .orderBy(desc(bookings.requestedAt));
  }

  async findInbox(
    tx: DbClient,
    driverId: string,
    filters: InboxFilters,
  ): Promise<InboxRow[]> {
    const conditions = [
      eq(trips.driverId, driverId),
      inArray(bookings.status, NON_TERMINAL_STATUSES),
    ];
    if (filters.tripId) {
      conditions.push(eq(trips.id, filters.tripId));
    }
    if (filters.passengerId) {
      conditions.push(eq(bookings.passengerId, filters.passengerId));
    }
    return tx
      .select({
        booking: bookings,
        ride: rides,
        trip: trips,
        passengerName: user.name,
        passengerImage: user.image,
      })
      .from(bookings)
      .innerJoin(rides, eq(bookings.rideId, rides.id))
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .innerJoin(user, eq(bookings.passengerId, user.id))
      .where(and(...conditions))
      .orderBy(asc(rides.scheduledDeparture));
  }

  async insertMany(tx: DbClient, rows: InsertBooking[]): Promise<Booking[]> {
    return tx.insert(bookings).values(rows).returning();
  }

  async acceptOneIfPending(tx: DbClient, bookingId: string): Promise<void> {
    await tx
      .update(bookings)
      .set({ status: 'accepted', acceptedAt: sql`now()` })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'pending')));
  }

  /**
   * Freezes the seat fare on a booking. Called from
   * `BookingsService.accept` in the same tx as `acceptOneIfPending`; once
   * set the value never changes for the lifetime of the booking.
   */
  async setFareCents(
    tx: DbClient,
    bookingId: string,
    fareCents: number,
  ): Promise<void> {
    await tx
      .update(bookings)
      .set({ fareCents })
      .where(eq(bookings.id, bookingId));
  }

  /** Stamps `boarded_at` to now if it hasn't been set yet. Idempotent. */
  async markBoardedIfUnboarded(
    tx: DbClient,
    bookingId: string,
  ): Promise<boolean> {
    const updated = await tx
      .update(bookings)
      .set({ boardedAt: sql`now()` as unknown as Date })
      .where(
        and(eq(bookings.id, bookingId), sql`${bookings.boardedAt} IS NULL`),
      )
      .returning({ id: bookings.id });
    return updated.length > 0;
  }

  /**
   * Flips a single booking from any non-terminal status to the supplied
   * terminal status, stamping the appropriate timestamp. Idempotent: a
   * second call after the row is already terminal updates zero rows and
   * returns an empty array.
   *
   * Sole caller is `BookingsService.markBookingResolved`, the seam
   * through which every accepted/pending booking funnels on its way to a
   * non-terminal final state (`cancelled` / `rejected` / `expired`).
   * Routing the writes through one method lets the service consistently
   * release the hold via WalletService.
   */
  async resolveOneIfNonTerminal(
    tx: DbClient,
    bookingId: string,
    finalStatus: 'cancelled' | 'rejected' | 'expired',
  ): Promise<{ id: string }[]> {
    const patch: Partial<typeof bookings.$inferInsert> = {
      status: finalStatus,
    };
    if (finalStatus === 'cancelled') {
      patch.cancelledAt = sql`now()` as unknown as Date;
    } else if (finalStatus === 'rejected') {
      patch.rejectedAt = sql`now()` as unknown as Date;
    }
    return tx
      .update(bookings)
      .set(patch)
      .where(
        and(
          eq(bookings.id, bookingId),
          inArray(bookings.status, NON_TERMINAL_STATUSES),
        ),
      )
      .returning({ id: bookings.id });
  }

  /**
   * pre: returns the ids of every PENDING booking whose ride.scheduledDeparture
   *      is in the past. ACCEPTED bookings on past rides are untouched —
   *      they were honored and belong to a different state machine.
   *
   * Callers iterate the ids and funnel each through
   * `BookingsService.markBookingResolved` so the uniform hold-release
   * contract holds (even though pending bookings never had a hold).
   */
  async findPendingIdsOnPastRides(tx: DbClient): Promise<string[]> {
    const rows = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .innerJoin(rides, eq(bookings.rideId, rides.id))
      .where(
        and(
          eq(bookings.status, 'pending'),
          lt(rides.scheduledDeparture, sql`now()`),
        ),
      );
    return rows.map((r) => r.id);
  }
}
