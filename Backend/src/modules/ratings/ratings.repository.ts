import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import { bookings, rides, trips, userRatings } from '@core/database/schema';
import type {
  InsertUserRating,
  UserRating,
} from '@core/database/schema/user-ratings.schema';

// Read-only ride/trip/booking lookup used by the ratings eligibility
// resolver. Same convention exception as `IncidentsRepository` — the join
// crosses module boundaries to avoid importing `TripsModule` and creating a
// cycle. The join is read-only; mutations stay in the service.
// See docs/plans/2026-05-25-user-ratings.md §Module layout.
export type RideEligibilitySnapshot = {
  rideId: string;
  status: string;
  driverId: string;
};

@Injectable()
export class RatingsRepository {
  async insert(tx: DbClient, row: InsertUserRating): Promise<UserRating> {
    const [inserted] = await tx.insert(userRatings).values(row).returning();
    return inserted;
  }

  /**
   * Returns the ride status plus the trip's driver id in one query so the
   * service can resolve eligibility without importing TripsModule.
   */
  async findRideEligibilitySnapshot(
    tx: DbClient,
    rideId: string,
  ): Promise<RideEligibilitySnapshot | null> {
    const [row] = await tx
      .select({
        rideId: rides.id,
        status: rides.status,
        driverId: trips.driverId,
      })
      .from(rides)
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .where(eq(rides.id, rideId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Returns `true` when the passenger boarded this ride (booking exists
   * with `boarded_at IS NOT NULL`). The booking's `status` is not consulted
   * — boarding is the authoritative participation signal (same rule as
   * `IncidentsService.assertEligibility`).
   */
  async hasBoardedOnRide(
    tx: DbClient,
    rideId: string,
    passengerId: string,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.rideId, rideId),
          eq(bookings.passengerId, passengerId),
          isNotNull(bookings.boardedAt),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * Computes the rating summary for a single ratee in one round-trip.
   * `AVG(score)` returns Postgres numeric; cast to double-precision so the
   * driver returns a JS number instead of a string. When no rows match,
   * Drizzle gives `{ count: 0, avg: null }` — surfaced as
   * `{ averageScore: null, count: 0 }` upstream.
   */
  async findSummaryForRatee(
    tx: DbClient,
    rateeId: string,
  ): Promise<{ count: number; avg: number | null }> {
    const [row] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        avg: sql<number | null>`avg(${userRatings.score})::float`,
      })
      .from(userRatings)
      .where(eq(userRatings.rateeId, rateeId));
    return row ?? { count: 0, avg: null };
  }

  async listForRatee(
    tx: DbClient,
    rateeId: string,
    params: { limit: number; offset: number },
  ): Promise<UserRating[]> {
    return tx
      .select()
      .from(userRatings)
      .where(eq(userRatings.rateeId, rateeId))
      .orderBy(desc(userRatings.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  async countForRatee(tx: DbClient, rateeId: string): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(userRatings)
      .where(eq(userRatings.rateeId, rateeId));
    return row?.count ?? 0;
  }
}
