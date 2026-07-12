/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DbClient } from '@core/database/database.module';
import type { UserRating } from '@core/database/schema/user-ratings.schema';
import { RatingsRepository } from './ratings.repository';
import { RatingsService } from './ratings.service';

const tx = {} as DbClient;

const mkRating = (over: Partial<UserRating> = {}): UserRating => ({
  id: 'rating_1',
  rideId: 'ride_1',
  raterId: 'rater_1',
  rateeId: 'ratee_1',
  score: 5,
  comment: null,
  createdAt: new Date('2026-05-25T10:00:00Z'),
  ...over,
});

const driverId = 'driver_1';
const passengerId = 'passenger_1';
const otherPassengerId = 'passenger_2';
const intruderId = 'intruder_1';
const rideId = 'ride_1';

describe('RatingsService', () => {
  let repo: jest.Mocked<RatingsRepository>;
  let db: { transaction: jest.Mock };
  let svc: RatingsService;

  beforeEach(() => {
    repo = {
      insert: jest.fn(),
      findRideEligibilitySnapshot: jest.fn(),
      hasBoardedOnRide: jest.fn(),
      findSummaryForRatee: jest.fn(),
      listForRatee: jest.fn(),
      countForRatee: jest.fn(),
    } as unknown as jest.Mocked<RatingsRepository>;
    db = {
      transaction: jest.fn(async (fn: (tx: DbClient) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    svc = new RatingsService(db as never, repo);
  });

  // ── eligibility resolver — full truth table ─────────────────────────────

  describe('create — eligibility truth table', () => {
    const seedCompletedRide = () =>
      repo.findRideEligibilitySnapshot.mockResolvedValue({
        rideId,
        status: 'completed',
        driverId,
      });

    it('driver rates a boarded passenger → OK', async () => {
      seedCompletedRide();
      // First call: rater (driver) — not used because driver branch is
      // checked first via driverId match. Second call: ratee passenger
      // boarded check.
      repo.hasBoardedOnRide.mockResolvedValueOnce(true);
      const inserted = mkRating({ raterId: driverId, rateeId: passengerId });
      repo.insert.mockResolvedValueOnce(inserted);

      await expect(
        svc.create(driverId, rideId, {
          rateeUserId: passengerId,
          score: 5,
        }),
      ).resolves.toEqual(inserted);
    });

    it('boarded passenger rates the driver → OK', async () => {
      seedCompletedRide();
      // Rater boarded check (rater is passenger) → true. No counter-party
      // boarded check because passenger branch only verifies ratee === driver.
      repo.hasBoardedOnRide.mockResolvedValueOnce(true);
      const inserted = mkRating({ raterId: passengerId, rateeId: driverId });
      repo.insert.mockResolvedValueOnce(inserted);

      await expect(
        svc.create(passengerId, rideId, {
          rateeUserId: driverId,
          score: 4,
        }),
      ).resolves.toEqual(inserted);
    });

    it('non-boarded passenger rates the driver → 403', async () => {
      seedCompletedRide();
      // Rater boarded check → false; never boarded so rejected here.
      repo.hasBoardedOnRide.mockResolvedValueOnce(false);

      await expect(
        svc.create(passengerId, rideId, {
          rateeUserId: driverId,
          score: 5,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('driver rates a non-boarded passenger → 400 NOT_ELIGIBLE', async () => {
      seedCompletedRide();
      // Driver is identified via driverId match, so first hasBoardedOnRide
      // call is for the ratee (passenger) and returns false.
      repo.hasBoardedOnRide.mockResolvedValueOnce(false);

      await expect(
        svc.create(driverId, rideId, {
          rateeUserId: passengerId,
          score: 5,
        }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        response: expect.objectContaining({
          code: 'RATING_NOT_ELIGIBLE',
          details: { reason: 'not_counterparty' },
        }) as unknown,
      });
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('passenger rates another passenger → 400 NOT_ELIGIBLE', async () => {
      seedCompletedRide();
      // Rater (passenger) boarded check → true. Then the passenger branch
      // checks ratee === driverId. Other passenger fails that.
      repo.hasBoardedOnRide.mockResolvedValueOnce(true);

      await expect(
        svc.create(passengerId, rideId, {
          rateeUserId: otherPassengerId,
          score: 5,
        }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        response: expect.objectContaining({
          code: 'RATING_NOT_ELIGIBLE',
          details: { reason: 'not_counterparty' },
        }) as unknown,
      });
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('random user (not driver, never boarded) rates any participant → 403', async () => {
      seedCompletedRide();
      repo.hasBoardedOnRide.mockResolvedValueOnce(false);

      await expect(
        svc.create(intruderId, rideId, {
          rateeUserId: driverId,
          score: 5,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rates self → 400 NOT_ELIGIBLE (defence-in-depth)', async () => {
      seedCompletedRide();
      // Driver rating themselves. Driver branch is entered (matches
      // driverId); then assertCounterParty sees rater === ratee and rejects.
      await expect(
        svc.create(driverId, rideId, {
          rateeUserId: driverId,
          score: 5,
        }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        response: expect.objectContaining({
          code: 'RATING_NOT_ELIGIBLE',
          details: { reason: 'not_counterparty' },
        }) as unknown,
      });
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('ride not completed → 400 NOT_ELIGIBLE with ride_not_completed', async () => {
      repo.findRideEligibilitySnapshot.mockResolvedValue({
        rideId,
        status: 'in_progress',
        driverId,
      });
      await expect(
        svc.create(driverId, rideId, {
          rateeUserId: passengerId,
          score: 5,
        }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        response: expect.objectContaining({
          code: 'RATING_NOT_ELIGIBLE',
          details: { reason: 'ride_not_completed' },
        }) as unknown,
      });
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('ride not found → 404', async () => {
      repo.findRideEligibilitySnapshot.mockResolvedValue(null);
      await expect(
        svc.create(driverId, 'nope', {
          rateeUserId: passengerId,
          score: 5,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('duplicate submit (unique-index 23505) → 409 RATING_ALREADY_SUBMITTED', async () => {
      seedCompletedRide();
      repo.hasBoardedOnRide.mockResolvedValueOnce(true); // ratee boarded
      // Drizzle wraps the PostgresError in a query-error wrapper with
      // `.cause`. Mirrors the production failure shape.
      const driverError = Object.assign(new Error('unique violation'), {
        code: '23505',
        constraint_name: 'user_ratings_ride_rater_ratee_uq',
      });
      const wrapped = Object.assign(new Error('drizzle query error'), {
        cause: driverError,
      });
      repo.insert.mockRejectedValueOnce(wrapped);

      await expect(
        svc.create(driverId, rideId, {
          rateeUserId: passengerId,
          score: 5,
        }),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        response: expect.objectContaining({
          code: 'RATING_ALREADY_SUBMITTED',
        }) as unknown,
      });
    });

    it('non-unique-violation insert error propagates unchanged', async () => {
      seedCompletedRide();
      repo.hasBoardedOnRide.mockResolvedValueOnce(true);
      const boom = new Error('network blip');
      repo.insert.mockRejectedValueOnce(boom);
      await expect(
        svc.create(driverId, rideId, {
          rateeUserId: passengerId,
          score: 5,
        }),
      ).rejects.toBe(boom);
    });
  });

  // ── aggregate calculation ──────────────────────────────────────────────

  describe('getSummaryForUser — aggregate', () => {
    it('returns { averageScore: null, count: 0 } when no ratings exist', async () => {
      repo.findSummaryForRatee.mockResolvedValueOnce({ count: 0, avg: null });
      await expect(svc.getSummaryForUser('u')).resolves.toEqual({
        averageScore: null,
        count: 0,
      });
    });

    it('returns the score and count for a single rating', async () => {
      repo.findSummaryForRatee.mockResolvedValueOnce({ count: 1, avg: 4 });
      await expect(svc.getSummaryForUser('u')).resolves.toEqual({
        averageScore: 4,
        count: 1,
      });
    });

    it('rounds to 2 decimals across many rows with mixed scores', async () => {
      // (5+4+3+5+2) / 5 = 3.8 — already 1 decimal, but the rounding rule
      // must hold across all results.
      repo.findSummaryForRatee.mockResolvedValueOnce({ count: 5, avg: 3.8 });
      await expect(svc.getSummaryForUser('u')).resolves.toEqual({
        averageScore: 3.8,
        count: 5,
      });
    });

    it('rounds repeating-decimal averages to 2 decimals', async () => {
      // (5+4+3) / 3 = 4 exactly. Use a non-trivial case: (4+5+3+5+5+4)/6 = 4.333…
      repo.findSummaryForRatee.mockResolvedValueOnce({
        count: 6,
        avg: 26 / 6,
      });
      const result = await svc.getSummaryForUser('u');
      expect(result.count).toBe(6);
      expect(result.averageScore).toBe(4.33);
    });

    it('returns { averageScore: null, count: 0 } when count is zero even if avg is somehow non-null', async () => {
      // Defensive: Postgres returns avg null on empty input, but the
      // service treats count===0 as authoritative for the empty state.
      repo.findSummaryForRatee.mockResolvedValueOnce({ count: 0, avg: 5 });
      await expect(svc.getSummaryForUser('u')).resolves.toEqual({
        averageScore: null,
        count: 0,
      });
    });
  });

  // ── admin list passthrough ────────────────────────────────────────────

  describe('listForRatee', () => {
    it('forwards limit/offset to repo and returns { items, total }', async () => {
      const items = [mkRating()];
      repo.listForRatee.mockResolvedValueOnce(items);
      repo.countForRatee.mockResolvedValueOnce(42);
      await expect(
        svc.listForRatee('u', { limit: 20, offset: 0 }),
      ).resolves.toEqual({ items, total: 42 });
      expect(repo.listForRatee).toHaveBeenCalledWith(expect.anything(), 'u', {
        limit: 20,
        offset: 0,
      });
    });
  });
});
