import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import { bookings, rides } from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import type {
  BookingResponseDto,
  BookingsBatchCreatedResponseDto,
  BookingsBatchOutcomeDto,
} from '@modules/trips/bookings/dto/bookings-response.dto';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import {
  makeBooking,
  makeCar,
  makeRide,
  makeTrip,
  makeTrustedContact,
} from './helpers/factories';

const futureDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

const pastDate = (daysBehind: number) =>
  new Date(Date.now() - daysBehind * 24 * 60 * 60 * 1000);

describe('Bookings (e2e)', () => {
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

  // ── helpers ────────────────────────────────────────────────────────────

  // All bookings.e2e users either publish trips or book seats — both
  // paths now require a trusted contact (US-05). Seed one here so every
  // suite case doesn't have to repeat the setup.
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
    const { userId, cookie } = await newUser(suffix);
    const car = await makeCar(db, userId);
    return { userId, cookie, car };
  };

  /** Trip + N future rides, all 3-seat, with no bookings. */
  const seedTripWithRides = async (
    driverId: string,
    carId: string,
    rideOpts: Array<Partial<Parameters<typeof makeRide>[2]>> = [{}],
  ) => {
    const trip = await makeTrip(db, driverId, { carId, seatsOffered: 3 });
    const rideRows = await Promise.all(
      rideOpts.map((opts, i) =>
        makeRide(db, trip.id, {
          scheduledDeparture: futureDate(i + 1),
          seatsOffered: 3,
          seatsOccupied: 0,
          ...opts,
        }),
      ),
    );
    return { trip, rides: rideRows };
  };

  // ───────────────────────────────────────────────────────────────────────
  // Passenger
  // ───────────────────────────────────────────────────────────────────────

  describe('POST /api/trips/:tripId/bookings (passenger create)', () => {
    it('creates the full batch atomically when every ride is valid', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}, {}],
      );

      const res = await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', passenger.cookie)
        .send({ rideIds: [r[0].id, r[1].id], message: 'hi' })
        .expect(201);

      const body = res.body as BookingsBatchCreatedResponseDto;
      expect(body.items).toHaveLength(2);
      body.items.forEach((b) => {
        expect(b.status).toBe('pending');
        expect(b.passengerId).toBe(passenger.userId);
        expect(b.tripId).toBe(trip.id);
      });
    });

    it('rolls the whole batch back when one ride already has an active booking by this passenger', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}, {}],
      );
      await makeBooking(db, passenger.userId, r[0].id, { status: 'pending' });

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', passenger.cookie)
        .send({ rideIds: [r[0].id, r[1].id] })
        .expect(409);

      const allRows = await db.select().from(bookings);
      // Only the pre-seeded one — new batch never landed.
      expect(allRows).toHaveLength(1);
    });

    it('allows re-requesting the same ride after a prior booking was cancelled', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );
      await makeBooking(db, passenger.userId, r[0].id, { status: 'cancelled' });

      const res = await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', passenger.cookie)
        .send({ rideIds: [r[0].id] })
        .expect(201);
      const body = res.body as BookingsBatchCreatedResponseDto;
      expect(body.items[0].status).toBe('pending');
    });

    it('rejects when a ride does not belong to the trip', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip } = await seedTripWithRides(driver.userId, driver.car.id, [
        {},
      ]);
      const otherTrip = await makeTrip(db, driver.userId, {
        carId: driver.car.id,
      });
      const otherRide = await makeRide(db, otherTrip.id, {
        scheduledDeparture: futureDate(1),
      });

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', passenger.cookie)
        .send({ rideIds: [otherRide.id] })
        .expect(400);
    });

    it('rejects when a ride is not active', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ status: 'cancelled' }],
      );

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', passenger.cookie)
        .send({ rideIds: [r[0].id] })
        .expect(400);
    });

    it('rejects when a ride has already departed', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ scheduledDeparture: pastDate(1) }],
      );

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', passenger.cookie)
        .send({ rideIds: [r[0].id] })
        .expect(400);
    });

    it('rejects when the requester is the trip driver', async () => {
      const driver = await seedDriverWithCar('a');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', driver.cookie)
        .send({ rideIds: [r[0].id] })
        .expect(400);
    });

    it('returns 404 for an unknown trip', async () => {
      const passenger = await newUser('p');
      await request(app.getHttpServer())
        .post('/api/trips/non-existent/bookings')
        .set('Cookie', passenger.cookie)
        .send({ rideIds: ['ride_x'] })
        .expect(404);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .post('/api/trips/trip_x/bookings')
        .send({ rideIds: ['ride_x'] })
        .expect(401);
    });
  });

  describe('GET /api/me/bookings', () => {
    it('filters by comma-separated case-insensitive status', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}, {}, {}],
      );
      await makeBooking(db, passenger.userId, r[0].id, { status: 'pending' });
      await makeBooking(db, passenger.userId, r[1].id, { status: 'accepted' });
      await makeBooking(db, passenger.userId, r[2].id, { status: 'rejected' });

      const res = await request(app.getHttpServer())
        .get('/api/me/bookings?status=PENDING,Accepted')
        .set('Cookie', passenger.cookie)
        .expect(200);

      const body = res.body as { items: BookingResponseDto[]; total: number };
      expect(body.total).toBe(2);
      const statuses = new Set(body.items.map((b) => b.status));
      expect(statuses).toEqual(new Set(['pending', 'accepted']));
    });

    it('scopes by tripId', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const t1 = await seedTripWithRides(driver.userId, driver.car.id, [{}]);
      const t2 = await seedTripWithRides(driver.userId, driver.car.id, [{}]);
      await makeBooking(db, passenger.userId, t1.rides[0].id);
      await makeBooking(db, passenger.userId, t2.rides[0].id);

      const res = await request(app.getHttpServer())
        .get(`/api/me/bookings?tripId=${t1.trip.id}`)
        .set('Cookie', passenger.cookie)
        .expect(200);

      const body = res.body as { items: BookingResponseDto[]; total: number };
      expect(body.total).toBe(1);
      expect(body.items[0].tripId).toBe(t1.trip.id);
    });
  });

  describe('GET /api/bookings/:bookingId', () => {
    it('is accessible by passenger and trip driver, forbidden for unrelated user', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const stranger = await newUser('s');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );
      const bk = await makeBooking(db, passenger.userId, r[0].id);

      await request(app.getHttpServer())
        .get(`/api/bookings/${bk.id}`)
        .set('Cookie', passenger.cookie)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/bookings/${bk.id}`)
        .set('Cookie', driver.cookie)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/bookings/${bk.id}`)
        .set('Cookie', stranger.cookie)
        .expect(403);
    });

    it('returns 404 for unknown id', async () => {
      const u = await newUser('p');
      await request(app.getHttpServer())
        .get('/api/bookings/missing')
        .set('Cookie', u.cookie)
        .expect(404);
    });
  });

  describe('POST /api/bookings/:bookingId/cancel', () => {
    it('cancels a PENDING booking and is idempotent on retry', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );
      const bk = await makeBooking(db, passenger.userId, r[0].id);

      await request(app.getHttpServer())
        .post(`/api/bookings/${bk.id}/cancel`)
        .set('Cookie', passenger.cookie)
        .expect(204);

      const [refreshed] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, bk.id));
      expect(refreshed.status).toBe('cancelled');
      expect(refreshed.cancelledAt).not.toBeNull();

      // Idempotent retry
      await request(app.getHttpServer())
        .post(`/api/bookings/${bk.id}/cancel`)
        .set('Cookie', passenger.cookie)
        .expect(204);
    });

    it('decrements seats_occupied when cancelling from ACCEPTED', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ seatsOccupied: 2 }],
      );
      const bk = await makeBooking(db, passenger.userId, r[0].id, {
        status: 'accepted',
      });

      await request(app.getHttpServer())
        .post(`/api/bookings/${bk.id}/cancel`)
        .set('Cookie', passenger.cookie)
        .expect(204);

      const [refreshedRide] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, r[0].id));
      expect(refreshedRide.seatsOccupied).toBe(1);
    });

    it('returns 403 when another user attempts to cancel', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const stranger = await newUser('s');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );
      const bk = await makeBooking(db, passenger.userId, r[0].id);

      await request(app.getHttpServer())
        .post(`/api/bookings/${bk.id}/cancel`)
        .set('Cookie', stranger.cookie)
        .expect(403);
    });
  });

  describe('POST /api/me/bookings/cancel (bulk passenger)', () => {
    it('cancels every non-terminal booking of mine on the trip and decrements seats per ACCEPTED', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ seatsOccupied: 2 }, { seatsOccupied: 1 }, {}],
      );
      const a = await makeBooking(db, passenger.userId, r[0].id, {
        status: 'accepted',
      });
      const b = await makeBooking(db, passenger.userId, r[1].id, {
        status: 'accepted',
      });
      const c = await makeBooking(db, passenger.userId, r[2].id, {
        status: 'pending',
      });

      await request(app.getHttpServer())
        .post(`/api/me/bookings/cancel`)
        .set('Cookie', passenger.cookie)
        .send({ tripId: trip.id })
        .expect(204);

      const refreshed = await db.select().from(bookings);
      const byId = new Map(refreshed.map((b) => [b.id, b]));
      expect(byId.get(a.id)!.status).toBe('cancelled');
      expect(byId.get(b.id)!.status).toBe('cancelled');
      expect(byId.get(c.id)!.status).toBe('cancelled');

      const refreshedRides = await db.select().from(rides);
      const ridesById = new Map(refreshedRides.map((r) => [r.id, r]));
      expect(ridesById.get(r[0].id)!.seatsOccupied).toBe(1);
      expect(ridesById.get(r[1].id)!.seatsOccupied).toBe(0);
      expect(ridesById.get(r[2].id)!.seatsOccupied).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Driver
  // ───────────────────────────────────────────────────────────────────────

  describe('POST /api/trips/:tripId/bookings/accept', () => {
    it('flips status to ACCEPTED and increments seats_occupied', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );
      const bk = await makeBooking(db, passenger.userId, r[0].id);

      const res = await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/accept`)
        .set('Cookie', driver.cookie)
        .send({ passengerId: passenger.userId, bookingIds: [bk.id] })
        .expect(200);

      const body = res.body as BookingsBatchOutcomeDto;
      expect(body.accepted).toEqual([bk.id]);
      expect(body.skipped).toEqual([]);

      const [refreshed] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, bk.id));
      expect(refreshed.status).toBe('accepted');

      const [refreshedRide] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, r[0].id));
      expect(refreshedRide.seatsOccupied).toBe(1);
    });

    it('marks RIDE_FULL when seats_occupied is already at the cap (concurrent winners)', async () => {
      const driver = await seedDriverWithCar('a');
      const p1 = await newUser('p1');
      const p2 = await newUser('p2');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ seatsOffered: 1, seatsOccupied: 0 }],
      );
      const b1 = await makeBooking(db, p1.userId, r[0].id);
      const b2 = await makeBooking(db, p2.userId, r[0].id);

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/trips/${trip.id}/bookings/accept`)
          .set('Cookie', driver.cookie)
          .send({ passengerId: p1.userId, bookingIds: [b1.id] }),
        request(app.getHttpServer())
          .post(`/api/trips/${trip.id}/bookings/accept`)
          .set('Cookie', driver.cookie)
          .send({ passengerId: p2.userId, bookingIds: [b2.id] }),
      ]);

      const bodies = [
        resA.body as BookingsBatchOutcomeDto,
        resB.body as BookingsBatchOutcomeDto,
      ];
      const winners = bodies.flatMap((b) => b.accepted);
      const losers = bodies.flatMap((b) => b.skipped);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0].reason).toBe('RIDE_FULL');

      const [refreshedRide] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, r[0].id));
      expect(refreshedRide.seatsOccupied).toBe(1);
    });

    it('skips with RIDE_DEPARTED when the ride has already departed', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ scheduledDeparture: pastDate(1) }],
      );
      const bk = await makeBooking(db, passenger.userId, r[0].id);

      const res = await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/accept`)
        .set('Cookie', driver.cookie)
        .send({ passengerId: passenger.userId, bookingIds: [bk.id] })
        .expect(200);

      const body = res.body as BookingsBatchOutcomeDto;
      expect(body.accepted).toEqual([]);
      expect(body.skipped).toEqual([{ id: bk.id, reason: 'RIDE_DEPARTED' }]);
    });

    it('skips with RIDE_DEPARTED when the ride is cancelled', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ status: 'cancelled' }],
      );
      const bk = await makeBooking(db, passenger.userId, r[0].id);

      const res = await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/accept`)
        .set('Cookie', driver.cookie)
        .send({ passengerId: passenger.userId, bookingIds: [bk.id] })
        .expect(200);

      const body = res.body as BookingsBatchOutcomeDto;
      expect(body.skipped[0].reason).toBe('RIDE_DEPARTED');
    });

    it('returns 403 for another driver', async () => {
      const a = await seedDriverWithCar('a');
      const b = await seedDriverWithCar('b');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(a.userId, a.car.id, [
        {},
      ]);
      const bk = await makeBooking(db, passenger.userId, r[0].id);

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/accept`)
        .set('Cookie', b.cookie)
        .send({ passengerId: passenger.userId, bookingIds: [bk.id] })
        .expect(403);
    });
  });

  describe('POST /api/trips/:tripId/bookings/reject', () => {
    it('transitions PENDING → REJECTED with no seat change', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ seatsOccupied: 2 }],
      );
      const bk = await makeBooking(db, passenger.userId, r[0].id);

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/reject`)
        .set('Cookie', driver.cookie)
        .send({
          passengerId: passenger.userId,
          bookingIds: [bk.id],
          rejectionReason: 'too far',
        })
        .expect(200);

      const [refreshed] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, bk.id));
      expect(refreshed.status).toBe('rejected');

      const [refreshedRide] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, r[0].id));
      expect(refreshedRide.seatsOccupied).toBe(2);
    });

    it('transitions ACCEPTED → REJECTED and decrements seats_occupied', async () => {
      const driver = await seedDriverWithCar('a');
      const passenger = await newUser('p');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ seatsOccupied: 1 }],
      );
      const bk = await makeBooking(db, passenger.userId, r[0].id, {
        status: 'accepted',
      });

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/reject`)
        .set('Cookie', driver.cookie)
        .send({ passengerId: passenger.userId, bookingIds: [bk.id] })
        .expect(200);

      const [refreshedRide] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, r[0].id));
      expect(refreshedRide.seatsOccupied).toBe(0);
    });

    it('returns 404 when bookingId does not belong to the passenger on this trip', async () => {
      const driver = await seedDriverWithCar('a');
      const p1 = await newUser('p1');
      const p2 = await newUser('p2');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );
      const bkP1 = await makeBooking(db, p1.userId, r[0].id);

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/reject`)
        .set('Cookie', driver.cookie)
        .send({ passengerId: p2.userId, bookingIds: [bkP1.id] })
        .expect(404);
    });
  });

  describe('POST /api/trips/:tripId/bookings/reject-all', () => {
    it('rejects every non-terminal booking on future rides; seat decrement only for previously ACCEPTED', async () => {
      const driver = await seedDriverWithCar('a');
      const p1 = await newUser('p1');
      const p2 = await newUser('p2');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ seatsOccupied: 2 }, { seatsOccupied: 0 }],
      );
      const past = await makeRide(db, trip.id, {
        scheduledDeparture: pastDate(1),
        seatsOccupied: 1,
      });

      const bAccepted = await makeBooking(db, p1.userId, r[0].id, {
        status: 'accepted',
      });
      const bPending = await makeBooking(db, p2.userId, r[1].id, {
        status: 'pending',
      });
      const bPastAccepted = await makeBooking(db, p1.userId, past.id, {
        status: 'accepted',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/reject-all`)
        .set('Cookie', driver.cookie)
        .send({ rejectionReason: 'changing plans' })
        .expect(200);

      const body = res.body as BookingsBatchOutcomeDto;
      expect(new Set(body.accepted)).toEqual(
        new Set([bAccepted.id, bPending.id]),
      );
      expect(body.skipped).toEqual([]);

      const all = await db.select().from(bookings);
      const byId = new Map(all.map((b) => [b.id, b]));
      expect(byId.get(bAccepted.id)!.status).toBe('rejected');
      expect(byId.get(bPending.id)!.status).toBe('rejected');
      // Past ride's accepted booking is left alone (not on a future ACTIVE ride)
      expect(byId.get(bPastAccepted.id)!.status).toBe('accepted');

      const allRides = await db.select().from(rides);
      const ridesById = new Map(allRides.map((r) => [r.id, r]));
      expect(ridesById.get(r[0].id)!.seatsOccupied).toBe(1);
      expect(ridesById.get(r[1].id)!.seatsOccupied).toBe(0);
      expect(ridesById.get(past.id)!.seatsOccupied).toBe(1);
    });

    it('returns 403 to a non-driver', async () => {
      const driver = await seedDriverWithCar('a');
      const other = await seedDriverWithCar('b');
      const { trip } = await seedTripWithRides(driver.userId, driver.car.id, [
        {},
      ]);
      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/reject-all`)
        .set('Cookie', other.cookie)
        .send({})
        .expect(403);
    });
  });
});
