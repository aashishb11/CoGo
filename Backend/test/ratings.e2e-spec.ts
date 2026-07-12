import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { type DbClient } from '@core/database/database.module';
import type { MailService } from '@integrations/mail/mail.service';
import { signUpAndVerify, signUpAndVerifyAsAdmin } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import {
  makeBooking,
  makeCar,
  makeRide,
  makeTrip,
  makeTrustedContact,
} from './helpers/factories';

type RatingResponse = {
  id: string;
  rideId: string;
  raterId: string;
  rateeId: string;
  score: number;
  comment: string | null;
  createdAt: string;
};

type RatingListResponse = {
  items: RatingResponse[];
  page: number;
  limit: number;
  total: number;
};

type SummaryResponse = { averageScore: number | null; count: number };

const minutes = (m: number) => m * 60 * 1000;

describe('Ratings (e2e)', () => {
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

  const newUser = async (suffix: string) => {
    const u = await signUpAndVerify(app, mailService, {
      email: `${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: 'password123',
      name: `User ${suffix}`,
    });
    await makeTrustedContact(db, u.userId);
    return u;
  };

  const seedDriverWithCar = async (suffix = 'driver') => {
    const u = await newUser(suffix);
    const car = await makeCar(db, u.userId);
    return { ...u, car };
  };

  // Seeds a completed ride with two boarded passengers. The ratings
  // endpoint doesn't replay the full lifecycle (start → board → complete),
  // it inspects rides.status + bookings.boarded_at directly, so we set
  // those columns at insert time. This mirrors how `incidents.e2e-spec.ts`
  // seeds its in-progress state directly.
  const seedCompletedRideWithPassengers = async () => {
    const driver = await seedDriverWithCar('d');
    const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
    const ride = await makeRide(db, trip.id, {
      scheduledDeparture: new Date(Date.now() - minutes(120)),
      status: 'completed',
      startedAt: new Date(Date.now() - minutes(115)),
      completedAt: new Date(Date.now() - minutes(60)),
    });
    const p1 = await newUser('p1');
    const p2 = await newUser('p2');
    await makeBooking(db, p1.userId, ride.id, {
      status: 'accepted',
      boardedAt: new Date(Date.now() - minutes(110)),
    });
    await makeBooking(db, p2.userId, ride.id, {
      status: 'accepted',
      boardedAt: new Date(Date.now() - minutes(110)),
    });
    return { driver, trip, ride, p1, p2 };
  };

  describe('POST /api/rides/:rideId/ratings — happy path', () => {
    it('driver rates each boarded passenger and each passenger rates the driver; summaries update', async () => {
      const { driver, ride, p1, p2 } = await seedCompletedRideWithPassengers();

      // Driver rates p1 with 5, p2 with 3 — comment included once to
      // exercise the comment column.
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', driver.cookie)
        .send({ rateeUserId: p1.userId, score: 5, comment: 'Excellent rider' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', driver.cookie)
        .send({ rateeUserId: p2.userId, score: 3 })
        .expect(201);

      // Both passengers rate the driver.
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', p1.cookie)
        .send({ rateeUserId: driver.userId, score: 4 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', p2.cookie)
        .send({ rateeUserId: driver.userId, score: 5 })
        .expect(201);

      // Driver's summary: avg(4,5) = 4.5, count 2.
      const driverSummary = await request(app.getHttpServer())
        .get('/api/me/ratings/summary')
        .set('Cookie', driver.cookie)
        .expect(200);
      expect(driverSummary.body as SummaryResponse).toEqual({
        averageScore: 4.5,
        count: 2,
      });

      // p1's summary: avg(5) = 5, count 1.
      const p1Summary = await request(app.getHttpServer())
        .get(`/api/users/${p1.userId}/ratings/summary`)
        .set('Cookie', driver.cookie)
        .expect(200);
      expect(p1Summary.body as SummaryResponse).toEqual({
        averageScore: 5,
        count: 1,
      });

      // p2's summary: avg(3) = 3, count 1.
      const p2Summary = await request(app.getHttpServer())
        .get(`/api/users/${p2.userId}/ratings/summary`)
        .set('Cookie', p1.cookie)
        .expect(200);
      expect(p2Summary.body as SummaryResponse).toEqual({
        averageScore: 3,
        count: 1,
      });
    });

    it('a user with zero ratings receives { averageScore: null, count: 0 }', async () => {
      const u = await newUser('lonely');
      const res = await request(app.getHttpServer())
        .get('/api/me/ratings/summary')
        .set('Cookie', u.cookie)
        .expect(200);
      expect(res.body as SummaryResponse).toEqual({
        averageScore: null,
        count: 0,
      });
    });
  });

  describe('POST /api/rides/:rideId/ratings — negative paths', () => {
    it('non-boarded passenger gets 403', async () => {
      const driver = await seedDriverWithCar('d');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() - minutes(60)),
        status: 'completed',
        completedAt: new Date(Date.now() - minutes(30)),
      });
      const passenger = await newUser('p');
      // Booking exists but boardedAt is null — the rater is not a
      // participant.
      await makeBooking(db, passenger.userId, ride.id, {
        status: 'accepted',
        boardedAt: null,
      });

      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', passenger.cookie)
        .send({ rateeUserId: driver.userId, score: 4 })
        .expect(403);
    });

    it('duplicate submit returns 409 RATING_ALREADY_SUBMITTED', async () => {
      const { driver, ride, p1 } = await seedCompletedRideWithPassengers();

      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', driver.cookie)
        .send({ rateeUserId: p1.userId, score: 5 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', driver.cookie)
        .send({ rateeUserId: p1.userId, score: 4 })
        .expect(409);
      expect((res.body as { code: string }).code).toBe(
        'RATING_ALREADY_SUBMITTED',
      );
    });

    it('ride not completed returns 400 RATING_NOT_ELIGIBLE with ride_not_completed', async () => {
      const driver = await seedDriverWithCar('d');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() + minutes(60)),
        status: 'active',
      });
      const passenger = await newUser('p');
      await makeBooking(db, passenger.userId, ride.id, {
        status: 'accepted',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', driver.cookie)
        .send({ rateeUserId: passenger.userId, score: 5 })
        .expect(400);
      expect(res.body).toMatchObject({
        code: 'RATING_NOT_ELIGIBLE',
        details: { reason: 'ride_not_completed' },
      });
    });

    it('score out of range surfaces as VALIDATION_FAILED', async () => {
      const { driver, ride, p1 } = await seedCompletedRideWithPassengers();
      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', driver.cookie)
        .send({ rateeUserId: p1.userId, score: 6 })
        .expect(400);
      expect((res.body as { code: string }).code).toBe('VALIDATION_FAILED');
    });

    it('driver rating a non-counter-party returns 400 NOT_ELIGIBLE / not_counterparty', async () => {
      const { driver, ride } = await seedCompletedRideWithPassengers();
      const intruder = await newUser('x');
      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', driver.cookie)
        .send({ rateeUserId: intruder.userId, score: 5 })
        .expect(400);
      expect(res.body).toMatchObject({
        code: 'RATING_NOT_ELIGIBLE',
        details: { reason: 'not_counterparty' },
      });
    });

    it('requires authentication', async () => {
      const { ride, p1 } = await seedCompletedRideWithPassengers();
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .send({ rateeUserId: p1.userId, score: 5 })
        .expect(401);
    });
  });

  describe('GET /api/admin/users/:userId/ratings', () => {
    it('admin sees the full paginated list with comments; non-admin gets 403', async () => {
      const { driver, ride, p1, p2 } = await seedCompletedRideWithPassengers();

      // Driver receives two ratings: 4 (no comment), 5 (with comment).
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', p1.cookie)
        .send({ rateeUserId: driver.userId, score: 4 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/ratings`)
        .set('Cookie', p2.cookie)
        .send({
          rateeUserId: driver.userId,
          score: 5,
          comment: 'Smooth and friendly',
        })
        .expect(201);

      const admin = await signUpAndVerifyAsAdmin(app, db, mailService, {
        email: `admin-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Admin',
      });

      const ok = await request(app.getHttpServer())
        .get(`/api/admin/users/${driver.userId}/ratings`)
        .set('Cookie', admin.cookie)
        .expect(200);
      const body = ok.body as RatingListResponse;
      expect(body.total).toBe(2);
      expect(body.items).toHaveLength(2);
      const comments = body.items.map((r) => r.comment);
      expect(comments).toEqual(
        expect.arrayContaining([null, 'Smooth and friendly']),
      );

      // Non-admin (the driver themselves) is forbidden. The admin guard
      // ships via `@Roles(['admin'])` from the better-auth admin plugin;
      // surfaces a 403 (sometimes 401) — assert anything in [401, 403] to
      // keep the test resilient to the plugin's default mapping.
      const denied = await request(app.getHttpServer())
        .get(`/api/admin/users/${driver.userId}/ratings`)
        .set('Cookie', driver.cookie);
      expect([401, 403]).toContain(denied.status);
    });
  });
});
