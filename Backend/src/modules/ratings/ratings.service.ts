import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB, type DbClient } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import type { UserRating } from '@core/database/schema/user-ratings.schema';
import {
  throwBadRequest,
  throwConflict,
  throwForbidden,
} from '@shared/errors/throw';
import type { CreateRatingDto } from './dto/create-rating.dto';
import {
  RatingsRepository,
  type RideEligibilitySnapshot,
} from './ratings.repository';

// Drizzle wraps Postgres errors in DrizzleQueryError; the original PostgresError
// (with `code` and `constraint_name`) is on `.cause`. Mirrors
// `BookingsService.isUniqueViolation`.
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

const UNIQUE_INDEX_NAME = 'user_ratings_ride_rater_ratee_uq';

type RaterRole = 'driver' | 'passenger';

@Injectable()
export class RatingsService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly repo: RatingsRepository,
  ) {}

  /**
   * Submits a rating after a completed ride. Resolves eligibility in the
   * order documented in `docs/plans/2026-05-25-user-ratings.md` §Eligibility:
   *
   *   1. Ride exists and is `completed` (else 400 RATING_NOT_ELIGIBLE
   *      `{ reason: 'ride_not_completed' }`).
   *   2. Rater is the trip's driver, OR a boarded passenger on the ride
   *      (else 403 FORBIDDEN).
   *   3. Ratee is the counter-party of the rater (else 400
   *      RATING_NOT_ELIGIBLE `{ reason: 'not_counterparty' }`). Same code
   *      covers rater === ratee (defence-in-depth).
   *   4. No existing rating for `(rideId, raterId, rateeId)` (else 409
   *      RATING_ALREADY_SUBMITTED). The unique index is the final backstop
   *      for parallel submits — `23505` is caught and translated below.
   *
   * `score` range is enforced by `class-validator` on the DTO; out-of-range
   * surfaces as the standard 400 VALIDATION_FAILED before reaching here.
   */
  async create(
    raterId: string,
    rideId: string,
    body: CreateRatingDto,
  ): Promise<UserRating> {
    return this.db.transaction(async (tx) => {
      const ride = await this.loadRideOrThrow(tx, rideId);
      if (ride.status !== 'completed') {
        throwBadRequest(
          'RATING_NOT_ELIGIBLE',
          'Ride must be completed before submitting a rating',
          { reason: 'ride_not_completed' },
        );
      }

      const raterRole = await this.resolveRaterRoleOrThrow(tx, ride, raterId);

      await this.assertCounterParty(
        tx,
        ride,
        raterId,
        body.rateeUserId,
        raterRole,
      );

      try {
        return await this.repo.insert(tx, {
          id: randomUUID(),
          rideId,
          raterId,
          rateeId: body.rateeUserId,
          score: body.score,
          comment: body.comment ?? null,
        });
      } catch (err) {
        if (isUniqueViolation(err, UNIQUE_INDEX_NAME)) {
          throwConflict(
            'RATING_ALREADY_SUBMITTED',
            'You have already rated this user for this ride',
          );
        }
        throw err;
      }
    });
  }

  async getSummaryForUser(
    userId: string,
  ): Promise<{ averageScore: number | null; count: number }> {
    const row = await this.repo.findSummaryForRatee(this.db, userId);
    if (row.count === 0 || row.avg === null) {
      return { averageScore: null, count: 0 };
    }
    // Round to 2 decimals so the FE renders "4.5" / "4.33" consistently
    // without locale-dependent toFixed rounding. Same rule documented in
    // the plan.
    const rounded = Math.round(row.avg * 100) / 100;
    return { averageScore: rounded, count: row.count };
  }

  async listForRatee(
    userId: string,
    params: { limit: number; offset: number },
  ): Promise<{ items: UserRating[]; total: number }> {
    const [items, total] = await Promise.all([
      this.repo.listForRatee(this.db, userId, params),
      this.repo.countForRatee(this.db, userId),
    ]);
    return { items, total };
  }

  // ── private helpers ────────────────────────────────────────────────────

  private async loadRideOrThrow(
    tx: DbClient,
    rideId: string,
  ): Promise<RideEligibilitySnapshot> {
    const row = await this.repo.findRideEligibilitySnapshot(tx, rideId);
    if (!row) {
      throw new NotFoundException('Ride not found');
    }
    return row;
  }

  private async resolveRaterRoleOrThrow(
    tx: DbClient,
    ride: RideEligibilitySnapshot,
    raterId: string,
  ): Promise<RaterRole> {
    if (ride.driverId === raterId) {
      return 'driver';
    }
    const boarded = await this.repo.hasBoardedOnRide(tx, ride.rideId, raterId);
    if (boarded) {
      return 'passenger';
    }
    throwForbidden(
      'FORBIDDEN',
      'Only the trip driver or a boarded passenger may rate on this ride',
    );
  }

  private async assertCounterParty(
    tx: DbClient,
    ride: RideEligibilitySnapshot,
    raterId: string,
    rateeId: string,
    raterRole: RaterRole,
  ): Promise<void> {
    if (raterId === rateeId) {
      throwBadRequest('RATING_NOT_ELIGIBLE', 'Cannot rate yourself', {
        reason: 'not_counterparty',
      });
    }

    if (raterRole === 'driver') {
      // Driver rates a boarded passenger on this ride.
      const passengerBoarded = await this.repo.hasBoardedOnRide(
        tx,
        ride.rideId,
        rateeId,
      );
      if (!passengerBoarded) {
        throwBadRequest(
          'RATING_NOT_ELIGIBLE',
          'Ratee must be a boarded passenger of this ride',
          { reason: 'not_counterparty' },
        );
      }
      return;
    }

    // Passenger rates the trip's driver.
    if (ride.driverId !== rateeId) {
      throwBadRequest(
        'RATING_NOT_ELIGIBLE',
        'Passengers may only rate the driver of the ride',
        { reason: 'not_counterparty' },
      );
    }
  }
}
