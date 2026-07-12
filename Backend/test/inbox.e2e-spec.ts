import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { type DbClient } from '@core/database/database.module';
import type { MailService } from '@integrations/mail/mail.service';
import type { InboxResponseDto } from '@modules/trips/bookings/dto/bookings-response.dto';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import { makeBooking, makeCar, makeRide, makeTrip } from './helpers/factories';

const futureDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

describe('Driver inbox (e2e)', () => {
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

  const seedDriverWithCar = async (suffix = 'driver') => {
    const { userId, cookie } = await newUser(suffix);
    const car = await makeCar(db, userId);
    return { userId, cookie, car };
  };

  describe('GET /api/me/inbox', () => {
    it('aggregates bookings per (trip, passenger) across multiple trips driven by the user', async () => {
      const driver = await seedDriverWithCar('d');
      const p1 = await newUser('p1');
      const p2 = await newUser('p2');

      const tripA = await makeTrip(db, driver.userId, {
        carId: driver.car.id,
        originLabel: 'Mataró',
        destinationLabel: 'Barcelona',
        type: 'recurring',
      });
      const tripB = await makeTrip(db, driver.userId, {
        carId: driver.car.id,
        originLabel: 'Sabadell',
        destinationLabel: 'Terrassa',
      });

      const a1 = await makeRide(db, tripA.id, {
        scheduledDeparture: futureDate(2),
      });
      const a2 = await makeRide(db, tripA.id, {
        scheduledDeparture: futureDate(3),
      });
      const b1 = await makeRide(db, tripB.id, {
        scheduledDeparture: futureDate(4),
      });

      // p1 has 2 bookings on tripA (one pending, one accepted) and 1 on tripB
      await makeBooking(db, p1.userId, a1.id, { status: 'pending' });
      await makeBooking(db, p1.userId, a2.id, { status: 'accepted' });
      await makeBooking(db, p1.userId, b1.id, { status: 'pending' });
      // p2 has 1 booking on tripA
      await makeBooking(db, p2.userId, a1.id, { status: 'pending' });

      const res = await request(app.getHttpServer())
        .get('/api/me/inbox')
        .set('Cookie', driver.cookie)
        .expect(200);

      const body = res.body as InboxResponseDto;
      expect(body.total).toBe(3); // (tripA, p1), (tripB, p1), (tripA, p2)

      const byKey = new Map(
        body.items.map((i) => [`${i.tripId}::${i.passenger.id}`, i]),
      );
      const tripAp1 = byKey.get(`${tripA.id}::${p1.userId}`)!;
      expect(tripAp1).toBeDefined();
      expect(tripAp1.bookings).toHaveLength(2);
      expect(tripAp1.pendingCount).toBe(1);
      expect(tripAp1.acceptedCount).toBe(1);
      expect(tripAp1.trip.originLabel).toBe('Mataró');
      expect(tripAp1.trip.destinationLabel).toBe('Barcelona');
      expect(tripAp1.trip.type).toBe('recurring');
      expect(tripAp1.passenger.id).toBe(p1.userId);
      expect(tripAp1.passenger.name).toContain('p1');
    });

    it("excludes batches with only terminal bookings and other drivers' trips", async () => {
      const driver = await seedDriverWithCar('d');
      const otherDriver = await seedDriverWithCar('other');
      const passenger = await newUser('p');

      const myTrip = await makeTrip(db, driver.userId, {
        carId: driver.car.id,
      });
      const myRide = await makeRide(db, myTrip.id, {
        scheduledDeparture: futureDate(1),
      });
      // Terminal-only batch: should not appear
      await makeBooking(db, passenger.userId, myRide.id, {
        status: 'rejected',
      });

      const otherTrip = await makeTrip(db, otherDriver.userId, {
        carId: otherDriver.car.id,
      });
      const otherRide = await makeRide(db, otherTrip.id, {
        scheduledDeparture: futureDate(1),
      });
      // Other driver's pending booking: should not appear in my inbox
      await makeBooking(db, passenger.userId, otherRide.id, {
        status: 'pending',
      });

      const res = await request(app.getHttpServer())
        .get('/api/me/inbox')
        .set('Cookie', driver.cookie)
        .expect(200);

      const body = res.body as InboxResponseDto;
      expect(body.total).toBe(0);
      expect(body.items).toEqual([]);
    });

    it('sorts pending-first by oldestPendingAt asc, then accepted-only batches', async () => {
      const driver = await seedDriverWithCar('d');
      const p1 = await newUser('p1');
      const p2 = await newUser('p2');
      const p3 = await newUser('p3');

      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const r1 = await makeRide(db, trip.id, {
        scheduledDeparture: futureDate(1),
      });
      const r2 = await makeRide(db, trip.id, {
        scheduledDeparture: futureDate(2),
      });
      const r3 = await makeRide(db, trip.id, {
        scheduledDeparture: futureDate(3),
      });

      // p2: oldest pending → first
      await makeBooking(db, p2.userId, r2.id, {
        status: 'pending',
        requestedAt: new Date(Date.now() - 60_000),
      });
      // p1: more recent pending → second
      await makeBooking(db, p1.userId, r1.id, {
        status: 'pending',
        requestedAt: new Date(Date.now() - 1_000),
      });
      // p3: only accepted → last
      await makeBooking(db, p3.userId, r3.id, { status: 'accepted' });

      const res = await request(app.getHttpServer())
        .get('/api/me/inbox')
        .set('Cookie', driver.cookie)
        .expect(200);

      const body = res.body as InboxResponseDto;
      expect(body.items.map((i) => i.passenger.id)).toEqual([
        p2.userId,
        p1.userId,
        p3.userId,
      ]);
      expect(body.items[2].oldestPendingAt).toBeNull();
    });

    it('paginates by batch with default limit', async () => {
      const driver = await seedDriverWithCar('d');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: futureDate(1),
      });
      // Three distinct passengers → three batches
      for (let i = 0; i < 3; i += 1) {
        const p = await newUser(`p${i}`);
        await makeBooking(db, p.userId, ride.id, { status: 'pending' });
      }

      const res = await request(app.getHttpServer())
        .get('/api/me/inbox')
        .query({ limit: 2 })
        .set('Cookie', driver.cookie)
        .expect(200);

      const body = res.body as InboxResponseDto;
      expect(body.total).toBe(3);
      expect(body.items).toHaveLength(2);
      expect(body.limit).toBe(2);
      expect(body.page).toBe(1);
    });

    it('?tripId scopes the inbox to one trip', async () => {
      const driver = await seedDriverWithCar('d');
      const passenger = await newUser('p');

      const tripA = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const tripB = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const a1 = await makeRide(db, tripA.id, {
        scheduledDeparture: futureDate(1),
      });
      const b1 = await makeRide(db, tripB.id, {
        scheduledDeparture: futureDate(2),
      });
      await makeBooking(db, passenger.userId, a1.id, { status: 'pending' });
      await makeBooking(db, passenger.userId, b1.id, { status: 'pending' });

      const res = await request(app.getHttpServer())
        .get('/api/me/inbox')
        .query({ tripId: tripA.id })
        .set('Cookie', driver.cookie)
        .expect(200);

      const body = res.body as InboxResponseDto;
      expect(body.total).toBe(1);
      expect(body.items[0].tripId).toBe(tripA.id);
    });

    it('?passengerId scopes the inbox to one passenger', async () => {
      const driver = await seedDriverWithCar('d');
      const p1 = await newUser('p1');
      const p2 = await newUser('p2');

      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const r1 = await makeRide(db, trip.id, {
        scheduledDeparture: futureDate(1),
      });
      await makeBooking(db, p1.userId, r1.id, { status: 'pending' });
      await makeBooking(db, p2.userId, r1.id, { status: 'pending' });

      const res = await request(app.getHttpServer())
        .get('/api/me/inbox')
        .query({ passengerId: p1.userId })
        .set('Cookie', driver.cookie)
        .expect(200);

      const body = res.body as InboxResponseDto;
      expect(body.total).toBe(1);
      expect(body.items[0].passenger.id).toBe(p1.userId);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer()).get('/api/me/inbox').expect(401);
    });
  });
});
