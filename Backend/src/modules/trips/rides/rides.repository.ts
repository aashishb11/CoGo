import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  between,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import {
  bookings,
  carModels,
  cars,
  organizations,
  rides,
  trips,
  user,
} from '@core/database/schema';
import type { InsertRide, Ride } from '@core/database/schema/rides.schema';
import type { Trip } from '@core/database/schema/trips.schema';
import type { RideStatus } from '../trips.types';

const RIDE_INSERT_CHUNK = 200;

/**
 * Flat projection returned by `findUpcomingActive`. Contains only the columns
 * needed by the traffic-watcher to avoid over-fetching.
 */
export type UpcomingActiveRide = {
  id: string;
  tripId: string;
  scheduledDeparture: Date;
  lastTrafficDelayNotifiedSeconds: number | null;
  driverId: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
};

export type EnrichedRideRow = {
  ride: Ride;
  trip: Trip;
  driverId: string;
  driverName: string;
  driverOrganizationId: string | null;
  driverOrganizationName: string | null;
  carModelBrand: string | null;
  carModelName: string | null;
};

const enrichedSelect = {
  ride: rides,
  trip: trips,
  driverId: user.id,
  driverName: user.name,
  driverOrganizationId: organizations.id,
  driverOrganizationName: organizations.name,
  carModelBrand: carModels.brand,
  carModelName: carModels.name,
} as const;

export type RideListForTripFilters = {
  statuses: readonly RideStatus[];
  fromBound: Date;
  to?: Date;
};

export type RideSearchParams = {
  date: { dayStart: Date; dayEnd: Date };
  origin: { lat: number; lng: number; latRange: number; lngRange: number };
  destination: { lat: number; lng: number; latRange: number; lngRange: number };
  seatsNeeded: number;
};

@Injectable()
export class RidesRepository {
  async findById(tx: DbClient, rideId: string): Promise<Ride | null> {
    const [row] = await tx
      .select()
      .from(rides)
      .where(eq(rides.id, rideId))
      .limit(1);
    return row ?? null;
  }

  async findByIds(tx: DbClient, rideIds: string[]): Promise<Ride[]> {
    if (rideIds.length === 0) {
      return [];
    }
    return tx.select().from(rides).where(inArray(rides.id, rideIds));
  }

  async findFutureActiveByTrip(tx: DbClient, tripId: string): Promise<Ride[]> {
    return tx
      .select()
      .from(rides)
      .where(
        and(
          eq(rides.tripId, tripId),
          eq(rides.status, 'active'),
          gt(rides.scheduledDeparture, sql`now()`),
        ),
      )
      .orderBy(asc(rides.scheduledDeparture));
  }

  async hasFutureActive(tx: DbClient, tripId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: rides.id })
      .from(rides)
      .where(
        and(
          eq(rides.tripId, tripId),
          eq(rides.status, 'active'),
          gt(rides.scheduledDeparture, sql`now()`),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async findFutureActiveBlockingSensitiveEdit(
    tx: DbClient,
    tripId: string,
  ): Promise<string[]> {
    const rows = await tx
      .select({ id: rides.id })
      .from(rides)
      .where(
        and(
          eq(rides.tripId, tripId),
          eq(rides.status, 'active'),
          gt(rides.scheduledDeparture, sql`now()`),
          exists(
            tx
              .select({ one: sql`1` })
              .from(bookings)
              .where(
                and(
                  eq(bookings.rideId, rides.id),
                  inArray(bookings.status, ['pending', 'accepted']),
                ),
              ),
          ),
        ),
      );
    return rows.map((r) => r.id);
  }

  async listForTrip(
    tx: DbClient,
    tripId: string,
    filters: RideListForTripFilters,
  ): Promise<Ride[]> {
    const conditions = [
      eq(rides.tripId, tripId),
      inArray(rides.status, filters.statuses as RideStatus[]),
      gte(rides.scheduledDeparture, filters.fromBound),
    ];
    if (filters.to) {
      conditions.push(lt(rides.scheduledDeparture, filters.to));
    }
    return tx
      .select()
      .from(rides)
      .where(and(...conditions))
      .orderBy(asc(rides.scheduledDeparture));
  }

  async findEnriched(
    tx: DbClient,
    rideId: string,
  ): Promise<EnrichedRideRow | null> {
    const [row] = await tx
      .select(enrichedSelect)
      .from(rides)
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .innerJoin(user, eq(trips.driverId, user.id))
      .leftJoin(organizations, eq(user.organizationId, organizations.id))
      .innerJoin(cars, eq(trips.carId, cars.id))
      .leftJoin(carModels, eq(cars.modelId, carModels.id))
      .where(eq(rides.id, rideId))
      .limit(1);
    return row ?? null;
  }

  async searchByBoundingBox(
    tx: DbClient,
    params: RideSearchParams,
  ): Promise<EnrichedRideRow[]> {
    return tx
      .select(enrichedSelect)
      .from(rides)
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .innerJoin(user, eq(trips.driverId, user.id))
      .leftJoin(organizations, eq(user.organizationId, organizations.id))
      .innerJoin(cars, eq(trips.carId, cars.id))
      .leftJoin(carModels, eq(cars.modelId, carModels.id))
      .where(
        and(
          eq(rides.status, 'active'),
          gte(rides.scheduledDeparture, params.date.dayStart),
          lt(rides.scheduledDeparture, params.date.dayEnd),
          between(
            rides.originLat,
            params.origin.lat - params.origin.latRange,
            params.origin.lat + params.origin.latRange,
          ),
          between(
            rides.originLng,
            params.origin.lng - params.origin.lngRange,
            params.origin.lng + params.origin.lngRange,
          ),
          between(
            rides.destinationLat,
            params.destination.lat - params.destination.latRange,
            params.destination.lat + params.destination.latRange,
          ),
          between(
            rides.destinationLng,
            params.destination.lng - params.destination.lngRange,
            params.destination.lng + params.destination.lngRange,
          ),
          sql`${rides.seatsOffered} - ${rides.seatsOccupied} >= ${params.seatsNeeded}`,
        ),
      )
      .orderBy(asc(rides.scheduledDeparture));
  }

  async lockForUpdate(tx: DbClient, rideId: string): Promise<Ride | null> {
    const [row] = await tx
      .select()
      .from(rides)
      .where(eq(rides.id, rideId))
      .for('update');
    return row ?? null;
  }

  async markCompleted(
    tx: DbClient,
    rideId: string,
    patch: { seatsOccupied: number; actualCo2SavedKg: number },
  ): Promise<void> {
    await tx
      .update(rides)
      .set({
        status: 'completed',
        completedAt: sql`now()`,
        seatsOccupied: patch.seatsOccupied,
        actualCo2SavedKg: patch.actualCo2SavedKg,
      })
      .where(eq(rides.id, rideId));
  }

  /**
   * Flips an `active` ride to `in_progress` and stamps `started_at`.
   * Caller guards status + window.
   */
  async markStarted(tx: DbClient, rideId: string): Promise<void> {
    await tx
      .update(rides)
      .set({ status: 'in_progress', startedAt: sql`now()` })
      .where(eq(rides.id, rideId));
  }

  /**
   * pre: ride is ACTIVE and the booking is transitioning in/out of ACCEPTED.
   *      Skip when the ride is going terminal in the same tx (counter freezes)
   *      or for complete-time freeze (writes `seatsOccupied` directly).
   *
   * SQL-side arithmetic so concurrent transitions can't lose-update.
   */
  async applySeatChange(
    tx: DbClient,
    rideId: string,
    delta: 1 | -1,
  ): Promise<void> {
    await tx
      .update(rides)
      .set({ seatsOccupied: sql`${rides.seatsOccupied} + ${delta}` })
      .where(eq(rides.id, rideId));
  }

  // pre: caller has already verified status. Mutates rides only —
  // booking-side cascade is the caller's responsibility.
  async cancelMany(
    tx: DbClient,
    rideIds: string[],
    reason: string | null,
  ): Promise<void> {
    if (rideIds.length === 0) {
      return;
    }
    await tx
      .update(rides)
      .set({
        status: 'cancelled',
        cancelledAt: sql`now()`,
        cancellationReason: reason ?? null,
      })
      .where(inArray(rides.id, rideIds));
  }

  async updateMany(
    tx: DbClient,
    rideIds: string[],
    patch: Partial<InsertRide>,
  ): Promise<void> {
    if (rideIds.length === 0 || Object.keys(patch).length === 0) {
      return;
    }
    await tx.update(rides).set(patch).where(inArray(rides.id, rideIds));
  }

  async bulkInsert(tx: DbClient, rows: InsertRide[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    for (let i = 0; i < rows.length; i += RIDE_INSERT_CHUNK) {
      const chunk = rows.slice(i, i + RIDE_INSERT_CHUNK);
      await tx.insert(rides).values(chunk);
    }
  }

  /**
   * Returns active rides whose `scheduledDeparture` falls within the next
   * `windowMinutes` minutes. Used exclusively by the traffic-watcher cron job.
   *
   * Coordinates come from the ride snapshot (not the parent trip) per the
   * design rule that ride origin / destination are frozen at generation time.
   */
  async findUpcomingActive(
    tx: DbClient,
    windowMinutes: number,
  ): Promise<UpcomingActiveRide[]> {
    return tx
      .select({
        id: rides.id,
        tripId: rides.tripId,
        scheduledDeparture: rides.scheduledDeparture,
        lastTrafficDelayNotifiedSeconds: rides.lastTrafficDelayNotifiedSeconds,
        driverId: trips.driverId,
        originLat: rides.originLat,
        originLng: rides.originLng,
        destinationLat: rides.destinationLat,
        destinationLng: rides.destinationLng,
      })
      .from(rides)
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .where(
        and(
          eq(rides.status, 'active'),
          gt(rides.scheduledDeparture, sql`now()`),
          lt(
            rides.scheduledDeparture,
            sql`now() + (${windowMinutes} * interval '1 minute')`,
          ),
        ),
      );
  }

  /**
   * Rides-sweep cron query #1 — "idle in-progress rides": status =
   * 'in_progress' and started more than `thresholdMinutes` minutes ago.
   * Returns just ids; the cron processes each row in its own transaction.
   */
  async findIdleInProgress(
    tx: DbClient,
    thresholdMinutes: number,
  ): Promise<string[]> {
    const rows = await tx
      .select({ id: rides.id })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'in_progress'),
          lt(
            rides.startedAt,
            sql`now() - (${thresholdMinutes} * interval '1 minute')`,
          ),
        ),
      );
    return rows.map((r) => r.id);
  }

  /**
   * Rides-sweep cron query #2 — "stranded active rides": active rides
   * whose scheduled_departure is more than `thresholdMinutes` minutes in
   * the past AND `started_at IS NULL` (the driver never hit
   * `POST /rides/:id/start`).
   */
  async findStrandedActive(
    tx: DbClient,
    thresholdMinutes: number,
  ): Promise<string[]> {
    const rows = await tx
      .select({ id: rides.id })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'active'),
          isNull(rides.startedAt),
          lt(
            rides.scheduledDeparture,
            sql`now() - (${thresholdMinutes} * interval '1 minute')`,
          ),
        ),
      );
    return rows.map((r) => r.id);
  }

  /**
   * Conditionally records the last traffic delay pushed to users for a ride.
   * Updates only when the new value is strictly higher than the stored one
   * (or the stored one is null), and returns whether the row was claimed.
   *
   * Two overlapping cron passes computing the same new delay race here:
   * the first commit wins, the loser sees the WHERE no longer matches and
   * gets `false`, so it skips the notification. This is what makes the
   * outbound side safe under any number of concurrent watchers.
   */
  async claimTrafficDelayNotification(
    tx: DbClient,
    rideId: string,
    delaySeconds: number,
  ): Promise<boolean> {
    const claimed = await tx
      .update(rides)
      .set({ lastTrafficDelayNotifiedSeconds: delaySeconds })
      .where(
        and(
          eq(rides.id, rideId),
          or(
            isNull(rides.lastTrafficDelayNotifiedSeconds),
            lt(rides.lastTrafficDelayNotifiedSeconds, delaySeconds),
          ),
        ),
      )
      .returning({ id: rides.id });
    return claimed.length > 0;
  }
}
