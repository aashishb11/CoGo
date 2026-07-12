import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import {
  bookings,
  rides,
  trips,
  walletHolds,
  walletTransactions,
  wallets,
} from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import type { BookingsBatchCreatedResponseDto } from '@modules/trips/bookings/dto/bookings-response.dto';
import type { RideDetailResponseDto } from '@modules/trips/rides/dto/rides-response.dto';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import {
  makeCar,
  makeRide,
  makeTrip,
  makeTrustedContact,
} from './helpers/factories';

const minutes = (m: number) => m * 60 * 1000;

describe('Rides lifecycle (e2e)', () => {
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

  const seedFundedPassenger = async (suffix: string, balanceCents: number) => {
    const p = await newUser(suffix);
    await db
      .insert(wallets)
      .values({ userId: p.userId, balanceCents, heldCents: 0 })
      .onConflictDoUpdate({
        target: wallets.userId,
        set: { balanceCents, heldCents: 0 },
      });
    return p;
  };

  // ── POST /rides/:rideId/start ─────────────────────────────────────────

  describe('POST /api/rides/:rideId/start', () => {
    const seedRide = async (scheduledDeparture: Date) => {
      const driver = await seedDriverWithCar('d');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const ride = await makeRide(db, trip.id, { scheduledDeparture });
      return { driver, trip, ride };
    };

    it('flips ACTIVE → IN_PROGRESS, stamps started_at, returns the ride detail', async () => {
      const { driver, ride } = await seedRide(
        new Date(Date.now() + minutes(10)),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/start`)
        .set('Cookie', driver.cookie)
        .expect(200);
      const body = res.body as RideDetailResponseDto;
      expect(body.status).toBe('in_progress');

      const [refreshed] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, ride.id));
      expect(refreshed.status).toBe('in_progress');
      expect(refreshed.startedAt).not.toBeNull();
    });

    it('rejects with RIDE_NOT_DEPARTED outside the −30m … +2h window', async () => {
      // Too early
      const early = await seedRide(new Date(Date.now() + minutes(60)));
      const r1 = await request(app.getHttpServer())
        .post(`/api/rides/${early.ride.id}/start`)
        .set('Cookie', early.driver.cookie)
        .expect(400);
      expect((r1.body as { code: string }).code).toBe('RIDE_NOT_DEPARTED');

      // Too late
      const late = await seedRide(new Date(Date.now() - minutes(180)));
      const r2 = await request(app.getHttpServer())
        .post(`/api/rides/${late.ride.id}/start`)
        .set('Cookie', late.driver.cookie)
        .expect(400);
      expect((r2.body as { code: string }).code).toBe('RIDE_NOT_DEPARTED');
    });

    it('refuses to start an already in_progress ride with RIDE_ALREADY_STARTED', async () => {
      const { driver, ride } = await seedRide(
        new Date(Date.now() + minutes(5)),
      );
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/start`)
        .set('Cookie', driver.cookie)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/start`)
        .set('Cookie', driver.cookie)
        .expect(400);
      expect((res.body as { code: string }).code).toBe('RIDE_ALREADY_STARTED');
    });

    it('rejects 403 for a non-driver and 404 for unknown ride', async () => {
      const { driver, ride } = await seedRide(
        new Date(Date.now() + minutes(10)),
      );
      const other = await seedDriverWithCar('other');
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/start`)
        .set('Cookie', other.cookie)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/rides/missing/start')
        .set('Cookie', driver.cookie)
        .expect(404);
    });
  });

  // ── cancel / complete guards once in_progress ─────────────────────────

  describe('in_progress guards', () => {
    const seedInProgressWithAcceptedBooking = async (
      pricePerSeatCents = 500,
    ) => {
      const driver = await seedDriverWithCar('d');
      const passenger = await seedFundedPassenger('p', 1000);
      const trip = await makeTrip(db, driver.userId, {
        carId: driver.car.id,
        seatsOffered: 3,
      });
      await db
        .update(trips)
        .set({ pricePerSeatCents })
        .where(eq(trips.id, trip.id));
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() + 60 * 60 * 1000),
        seatsOffered: 3,
        seatsOccupied: 0,
      });
      const create = await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', passenger.cookie)
        .send({ rideIds: [ride.id] })
        .expect(201);
      const bookingId = (create.body as BookingsBatchCreatedResponseDto)
        .items[0].id;
      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/accept`)
        .set('Cookie', driver.cookie)
        .send({ passengerId: passenger.userId, bookingIds: [bookingId] })
        .expect(200);
      await db
        .update(rides)
        .set({ scheduledDeparture: new Date(Date.now() - 5 * 60 * 1000) })
        .where(eq(rides.id, ride.id));
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/start`)
        .set('Cookie', driver.cookie)
        .expect(200);
      return { driver, passenger, trip, ride, bookingId };
    };

    it('passenger cancel refused once ride is in_progress (RIDE_ALREADY_STARTED)', async () => {
      const { passenger, bookingId } =
        await seedInProgressWithAcceptedBooking();
      const res = await request(app.getHttpServer())
        .post(`/api/bookings/${bookingId}/cancel`)
        .set('Cookie', passenger.cookie)
        .expect(400);
      expect((res.body as { code: string }).code).toBe('RIDE_ALREADY_STARTED');
    });

    it('driver cancel refused once ride is in_progress (RIDE_ALREADY_STARTED)', async () => {
      const { driver, ride } = await seedInProgressWithAcceptedBooking();
      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/cancel`)
        .set('Cookie', driver.cookie)
        .send({})
        .expect(400);
      expect((res.body as { code: string }).code).toBe('RIDE_ALREADY_STARTED');
    });
  });

  // ── complete with unscannedOutcomes overrides ─────────────────────────

  describe('POST /api/rides/:rideId/complete with overrides', () => {
    const seedDepartedRideWithTwoAccepted = async () => {
      const driver = await seedDriverWithCar('d');
      const p1 = await seedFundedPassenger('p1', 1000);
      const p2 = await seedFundedPassenger('p2', 1000);
      const trip = await makeTrip(db, driver.userId, {
        carId: driver.car.id,
        seatsOffered: 3,
      });
      await db
        .update(trips)
        .set({ pricePerSeatCents: 500 })
        .where(eq(trips.id, trip.id));
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() + 60 * 60 * 1000),
        seatsOffered: 3,
        seatsOccupied: 0,
      });
      const c1 = await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', p1.cookie)
        .send({ rideIds: [ride.id] })
        .expect(201);
      const c2 = await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', p2.cookie)
        .send({ rideIds: [ride.id] })
        .expect(201);
      const bk1 = (c1.body as BookingsBatchCreatedResponseDto).items[0].id;
      const bk2 = (c2.body as BookingsBatchCreatedResponseDto).items[0].id;
      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/accept`)
        .set('Cookie', driver.cookie)
        .send({ passengerId: p1.userId, bookingIds: [bk1] })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings/accept`)
        .set('Cookie', driver.cookie)
        .send({ passengerId: p2.userId, bookingIds: [bk2] })
        .expect(200);
      // Back-date the departure so the post-departure default applies.
      await db
        .update(rides)
        .set({ scheduledDeparture: new Date(Date.now() - 60 * 60 * 1000) })
        .where(eq(rides.id, ride.id));
      return { driver, p1, p2, trip, ride, bk1, bk2 };
    };

    it('default rule (post-departure, no override) captures unscanned holds as no-show — boardedAt stays null', async () => {
      const { driver, p1, ride, bk1 } = await seedDepartedRideWithTwoAccepted();

      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/complete`)
        .set('Cookie', driver.cookie)
        .send({})
        .expect(200);

      const [bk] = await db.select().from(bookings).where(eq(bookings.id, bk1));
      expect(bk.boardedAt).toBeNull(); // no-show
      // Passenger was charged.
      const [pw] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, p1.userId));
      expect(pw.balanceCents).toBe(500);
      expect(pw.heldCents).toBe(0);
      // Hold captured.
      const [hold] = await db
        .select()
        .from(walletHolds)
        .where(eq(walletHolds.bookingId, bk1));
      expect(hold.status).toBe('captured');
    });

    it('refund override releases the hold and writes no ledger row', async () => {
      const { driver, p1, ride, bk1 } = await seedDepartedRideWithTwoAccepted();

      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/complete`)
        .set('Cookie', driver.cookie)
        .send({ unscannedOutcomes: [{ bookingId: bk1, outcome: 'refund' }] })
        .expect(200);

      const [bk] = await db.select().from(bookings).where(eq(bookings.id, bk1));
      expect(bk.boardedAt).toBeNull();
      const [pw] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, p1.userId));
      expect(pw.balanceCents).toBe(1000); // unchanged
      expect(pw.heldCents).toBe(0);
      const [hold] = await db
        .select()
        .from(walletHolds)
        .where(eq(walletHolds.bookingId, bk1));
      expect(hold.status).toBe('released');
      const ledger = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.bookingId, bk1));
      expect(ledger).toHaveLength(0);
    });

    it('boarded override captures the hold AND stamps boardedAt; counts for CO2', async () => {
      const { driver, ride, bk1, bk2 } =
        await seedDepartedRideWithTwoAccepted();

      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/complete`)
        .set('Cookie', driver.cookie)
        .send({
          unscannedOutcomes: [
            { bookingId: bk1, outcome: 'boarded' },
            { bookingId: bk2, outcome: 'refund' },
          ],
        })
        .expect(200);
      const body = res.body as RideDetailResponseDto;
      expect(body.seatsOccupied).toBe(1);

      const [bk] = await db.select().from(bookings).where(eq(bookings.id, bk1));
      expect(bk.boardedAt).not.toBeNull();
    });
  });
});
