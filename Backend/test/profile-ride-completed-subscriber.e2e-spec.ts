import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq, inArray } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import { profile } from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import { ProfileRideCompletedSubscriberService } from '@modules/users/profile-ride-completed-subscriber.service';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import {
  makeBooking,
  makeCar,
  makeCarModel,
  makeProfile,
  makeRide,
  makeTrip,
} from './helpers/factories';

const pastDate = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

// Subscriber runs on a microtask (`async: true`), so the DB write lands
// after the HTTP response. Poll briefly to avoid flake.
async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  {
    timeoutMs = 1000,
    intervalMs = 25,
  }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await fn();
  while (!predicate(last)) {
    if (Date.now() > deadline) {
      return last;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await fn();
  }
  return last;
}

describe('Profile ride-completed subscriber (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let mailService: MailService;

  beforeAll(async () => {
    ({ app, db, mailService } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  const newUser = (suffix: string) =>
    signUpAndVerify(app, mailService, {
      email: `${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: 'password123',
      name: `User ${suffix}`,
    });

  /** Driver user + ACCEPTED bookings for each passenger on a single future ride. */
  const seedRideReadyToComplete = async (opts: {
    co2KgPerKm: number;
    totalDistanceKm: number;
    seatsOffered: number;
    seatsOccupied: number;
  }) => {
    const driver = await newUser('drv');
    const carModel = await makeCarModel(db, { co2KgPerKm: opts.co2KgPerKm });
    const car = await makeCar(db, driver.userId, { modelId: carModel.id });
    const trip = await makeTrip(db, driver.userId, {
      carId: car.id,
      seatsOffered: opts.seatsOffered,
      totalDistanceKm: opts.totalDistanceKm,
    });
    const ride = await makeRide(db, trip.id, {
      scheduledDeparture: pastDate(1),
      seatsOffered: opts.seatsOffered,
      seatsOccupied: opts.seatsOccupied,
      totalDistanceKm: opts.totalDistanceKm,
    });
    return { driver, ride };
  };

  it('increments total_co2_saved by actualCo2SavedKg on driver and every accepted passenger profile', async () => {
    const { driver, ride } = await seedRideReadyToComplete({
      co2KgPerKm: 0.2,
      totalDistanceKm: 30,
      seatsOffered: 3,
      seatsOccupied: 2,
    });
    const p1 = await newUser('p1');
    const p2 = await newUser('p2');
    // Boarded → counts for CO2 under the new settlement contract.
    await makeBooking(db, p1.userId, ride.id, {
      status: 'accepted',
      boardedAt: new Date(),
    });
    await makeBooking(db, p2.userId, ride.id, {
      status: 'accepted',
      boardedAt: new Date(),
    });

    await makeProfile(db, driver.userId, { totalCo2Saved: 1 });
    await makeProfile(db, p1.userId, { totalCo2Saved: 2 });
    await makeProfile(db, p2.userId, { totalCo2Saved: 3 });

    await request(app.getHttpServer())
      .post(`/api/rides/${ride.id}/complete`)
      .set('Cookie', driver.cookie)
      .send({})
      .expect(200);

    // 2 seats * 30 km * 0.2 kg/km = 12 kg
    const expectedDelta = 12;
    const ids = [driver.userId, p1.userId, p2.userId];
    const rows = await waitFor(
      () =>
        db
          .select({
            userId: profile.userId,
            totalCo2Saved: profile.totalCo2Saved,
          })
          .from(profile)
          .where(inArray(profile.userId, ids)),
      (r) =>
        r.every((row) => {
          const baseline =
            row.userId === driver.userId ? 1 : row.userId === p1.userId ? 2 : 3;
          return (
            Math.abs(row.totalCo2Saved - (baseline + expectedDelta)) < 1e-6
          );
        }),
    );

    const byUser = new Map(rows.map((r) => [r.userId, r.totalCo2Saved]));
    expect(byUser.get(driver.userId)).toBeCloseTo(1 + expectedDelta, 6);
    expect(byUser.get(p1.userId)).toBeCloseTo(2 + expectedDelta, 6);
    expect(byUser.get(p2.userId)).toBeCloseTo(3 + expectedDelta, 6);
  });

  it('subscriber failure does not surface as a 500 from POST complete', async () => {
    const { driver, ride } = await seedRideReadyToComplete({
      co2KgPerKm: 0.1,
      totalDistanceKm: 10,
      seatsOffered: 2,
      seatsOccupied: 1,
    });
    await makeProfile(db, driver.userId, { totalCo2Saved: 0 });

    const subscriber = app.get(ProfileRideCompletedSubscriberService);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const original = subscriber.handleRideCompleted.bind(subscriber);
    const throwing: typeof subscriber.handleRideCompleted = () => {
      throw new Error('boom');
    };
    subscriber.handleRideCompleted = throwing;

    try {
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/complete`)
        .set('Cookie', driver.cookie)
        .send({})
        .expect(200);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      subscriber.handleRideCompleted = original;
    }
  });

  it('skips recipients with no profile row without erroring; others increment normally', async () => {
    const { driver, ride } = await seedRideReadyToComplete({
      co2KgPerKm: 0.2,
      totalDistanceKm: 20,
      seatsOffered: 3,
      seatsOccupied: 2,
    });
    const p1 = await newUser('p1');
    const p2 = await newUser('p2');
    await makeBooking(db, p1.userId, ride.id, {
      status: 'accepted',
      boardedAt: new Date(),
    });
    await makeBooking(db, p2.userId, ride.id, {
      status: 'accepted',
      boardedAt: new Date(),
    });

    // Only the driver and p1 have profiles — p2 has no profile row.
    await makeProfile(db, driver.userId, { totalCo2Saved: 0 });
    await makeProfile(db, p1.userId, { totalCo2Saved: 0 });

    await request(app.getHttpServer())
      .post(`/api/rides/${ride.id}/complete`)
      .set('Cookie', driver.cookie)
      .send({})
      .expect(200);

    // 2 * 20 * 0.2 = 8
    const expectedDelta = 8;
    const rows = await waitFor(
      () =>
        db
          .select({
            userId: profile.userId,
            totalCo2Saved: profile.totalCo2Saved,
          })
          .from(profile)
          .where(inArray(profile.userId, [driver.userId, p1.userId])),
      (r) =>
        r.length === 2 &&
        r.every((row) => row.totalCo2Saved >= expectedDelta - 1e-6),
    );

    const byUser = new Map(rows.map((r) => [r.userId, r.totalCo2Saved]));
    expect(byUser.get(driver.userId)).toBeCloseTo(expectedDelta, 6);
    expect(byUser.get(p1.userId)).toBeCloseTo(expectedDelta, 6);

    const [missing] = await db
      .select()
      .from(profile)
      .where(eq(profile.userId, p2.userId));
    expect(missing).toBeUndefined();
  });
});
