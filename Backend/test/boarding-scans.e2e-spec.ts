import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import {
  signBoardingToken,
  windowFor,
} from '@modules/trips/bookings/domain/boarding-token';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import {
  makeCar,
  makeRide,
  makeTrip,
  makeTrustedContact,
} from './helpers/factories';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

describe('Boarding scans (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let mailService: MailService;
  let boardingSecret: string;

  beforeAll(async () => {
    ({ app, db, mailService } = await bootstrapTestApp());
    boardingSecret = app
      .get(ConfigService)
      .getOrThrow<string>('BOARDING_TOKEN_SECRET');
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

  // Build a ready-to-scan scenario: trip with one ride, ride is
  // IN_PROGRESS, booking is ACCEPTED with a 500-cent hold.
  //
  // We seed the ride with a future scheduledDeparture (so booking
  // creation passes the "ride must not have departed" guard), then
  // back-date the column and call `POST /start` inside its window.
  const seedReadyToScan = async (pricePerSeatCents = 500) => {
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
    const bookingId = (create.body as BookingsBatchCreatedResponseDto).items[0]
      .id;
    await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings/accept`)
      .set('Cookie', driver.cookie)
      .send({ passengerId: passenger.userId, bookingIds: [bookingId] })
      .expect(200);
    // Back-date so the start window (`−30m … +2h`) and the
    // post-departure ride-complete guard both pass.
    await db
      .update(rides)
      .set({ scheduledDeparture: minutesAgo(5) })
      .where(eq(rides.id, ride.id));
    await request(app.getHttpServer())
      .post(`/api/rides/${ride.id}/start`)
      .set('Cookie', driver.cookie)
      .expect(200);
    return { driver, passenger, trip, ride, bookingId, pricePerSeatCents };
  };

  it('happy path: passenger mints token, driver scans → hold captured, payment + earning rows written', async () => {
    const { driver, passenger, bookingId, pricePerSeatCents } =
      await seedReadyToScan(500);

    const tokenRes = await request(app.getHttpServer())
      .get(`/api/me/bookings/${bookingId}/boarding-token`)
      .set('Cookie', passenger.cookie)
      .expect(200);
    const { token } = tokenRes.body as { token: string };
    expect(token).toMatch(/[^.]+\.[^.]+/);

    const scanRes = await request(app.getHttpServer())
      .post('/api/boarding-scans')
      .set('Cookie', driver.cookie)
      .send({ token })
      .expect(200);
    expect(scanRes.body).toMatchObject({
      bookingId,
      fareCents: pricePerSeatCents,
    });

    const [bk] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(bk.boardedAt).not.toBeNull();

    // Passenger wallet: balance −500, held −500.
    const [pw] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, passenger.userId));
    expect(pw.balanceCents).toBe(500);
    expect(pw.heldCents).toBe(0);

    // Driver wallet: balance +500.
    const [dw] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, driver.userId));
    expect(dw.balanceCents).toBe(500);

    // Hold captured.
    const [hold] = await db
      .select()
      .from(walletHolds)
      .where(eq(walletHolds.bookingId, bookingId));
    expect(hold.status).toBe('captured');

    // Ledger pair written.
    const txs = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.bookingId, bookingId));
    const payment = txs.find((t) => t.type === 'payment');
    const earning = txs.find((t) => t.type === 'earning');
    expect(payment?.amountCents).toBe(-500);
    expect(payment?.walletId).toBe(passenger.userId);
    expect(earning?.amountCents).toBe(500);
    expect(earning?.walletId).toBe(driver.userId);
  });

  it('rejects an invalid token with BOARDING_TOKEN_INVALID', async () => {
    const { driver } = await seedReadyToScan();

    const res = await request(app.getHttpServer())
      .post('/api/boarding-scans')
      .set('Cookie', driver.cookie)
      .send({ token: 'not-a-real-token' })
      .expect(400);
    expect((res.body as { code: string }).code).toBe('BOARDING_TOKEN_INVALID');
  });

  it('rejects a second scan of the same booking with BOARDING_ALREADY_RECORDED', async () => {
    const { driver, passenger, bookingId } = await seedReadyToScan();

    const tokenRes = await request(app.getHttpServer())
      .get(`/api/me/bookings/${bookingId}/boarding-token`)
      .set('Cookie', passenger.cookie)
      .expect(200);
    const token = (tokenRes.body as { token: string }).token;

    await request(app.getHttpServer())
      .post('/api/boarding-scans')
      .set('Cookie', driver.cookie)
      .send({ token })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/boarding-scans')
      .set('Cookie', driver.cookie)
      .send({ token })
      .expect(400);
    expect((res.body as { code: string }).code).toBe(
      'BOARDING_ALREADY_RECORDED',
    );
  });

  it('refuses a scan when the ride is not in_progress', async () => {
    const driver = await seedDriverWithCar('d');
    const passenger = await seedFundedPassenger('p', 1000);
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
    const create = await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings`)
      .set('Cookie', passenger.cookie)
      .send({ rideIds: [ride.id] })
      .expect(201);
    const bookingId = (create.body as BookingsBatchCreatedResponseDto).items[0]
      .id;
    await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings/accept`)
      .set('Cookie', driver.cookie)
      .send({ passengerId: passenger.userId, bookingIds: [bookingId] })
      .expect(200);

    // Token minted manually since the GET endpoint also enforces
    // in_progress (we want to exercise the scan-side guard).
    const token = signBoardingToken(
      { bookingId, window: windowFor() },
      boardingSecret,
    );

    const res = await request(app.getHttpServer())
      .post('/api/boarding-scans')
      .set('Cookie', driver.cookie)
      .send({ token })
      .expect(400);
    expect((res.body as { code: string }).code).toBe('RIDE_NOT_IN_PROGRESS');
  });

  it('refuses a scan from a non-driver caller', async () => {
    const { passenger, bookingId } = await seedReadyToScan();
    const other = await seedDriverWithCar('other');

    const tokenRes = await request(app.getHttpServer())
      .get(`/api/me/bookings/${bookingId}/boarding-token`)
      .set('Cookie', passenger.cookie)
      .expect(200);
    const token = (tokenRes.body as { token: string }).token;

    await request(app.getHttpServer())
      .post('/api/boarding-scans')
      .set('Cookie', other.cookie)
      .send({ token })
      .expect(403);
  });

  it('refuses minting a token before the ride is in_progress', async () => {
    const driver = await seedDriverWithCar('d');
    const passenger = await seedFundedPassenger('p', 1000);
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
    const create = await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings`)
      .set('Cookie', passenger.cookie)
      .send({ rideIds: [ride.id] })
      .expect(201);
    const bookingId = (create.body as BookingsBatchCreatedResponseDto).items[0]
      .id;
    await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings/accept`)
      .set('Cookie', driver.cookie)
      .send({ passengerId: passenger.userId, bookingIds: [bookingId] })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/me/bookings/${bookingId}/boarding-token`)
      .set('Cookie', passenger.cookie)
      .expect(400);
    expect((res.body as { code: string }).code).toBe('RIDE_NOT_IN_PROGRESS');

    // Sanity: ride is still active.
    const [refreshed] = await db
      .select()
      .from(rides)
      .where(eq(rides.id, ride.id));
    expect(refreshed.status).toBe('active');
  });
});
