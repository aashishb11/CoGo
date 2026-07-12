import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { and, eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import { bookings, trips, walletHolds, wallets } from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import type {
  BookingsBatchCreatedResponseDto,
  BookingsBatchOutcomeDto,
} from '@modules/trips/bookings/dto/bookings-response.dto';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import {
  makeCar,
  makeRide,
  makeTrip,
  makeTrustedContact,
} from './helpers/factories';

const futureDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

describe('Wallet holds (e2e)', () => {
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

  const seedTripWithRides = async (
    driverId: string,
    carId: string,
    pricePerSeatCents: number,
    rideOpts: Array<Partial<Parameters<typeof makeRide>[2]>> = [{}],
  ) => {
    const trip = await makeTrip(db, driverId, { carId, seatsOffered: 3 });
    await db
      .update(trips)
      .set({ pricePerSeatCents })
      .where(eq(trips.id, trip.id));
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

  it('booking + accept reserves the fare; passenger held_cents goes up by fare', async () => {
    const driver = await seedDriverWithCar('d');
    const passenger = await seedFundedPassenger('p', 1000);
    const { trip, rides: r } = await seedTripWithRides(
      driver.userId,
      driver.car.id,
      500,
    );

    const created = await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings`)
      .set('Cookie', passenger.cookie)
      .send({ rideIds: [r[0].id] })
      .expect(201);
    const bookingId = (created.body as BookingsBatchCreatedResponseDto).items[0]
      .id;

    // Pending: no hold yet.
    const [walletBefore] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, passenger.userId));
    expect(walletBefore.heldCents).toBe(0);

    const acceptRes = await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings/accept`)
      .set('Cookie', driver.cookie)
      .send({ passengerId: passenger.userId, bookingIds: [bookingId] })
      .expect(200);
    expect((acceptRes.body as BookingsBatchOutcomeDto).accepted).toEqual([
      bookingId,
    ]);

    const [walletAfter] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, passenger.userId));
    expect(walletAfter.balanceCents).toBe(1000);
    expect(walletAfter.heldCents).toBe(500);

    const [hold] = await db
      .select()
      .from(walletHolds)
      .where(
        and(
          eq(walletHolds.bookingId, bookingId),
          eq(walletHolds.status, 'active'),
        ),
      );
    expect(hold.amountCents).toBe(500);

    const [bk] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(bk.fareCents).toBe(500);
  });

  it('passenger cancels: hold flips to released and held_cents goes back to 0', async () => {
    const driver = await seedDriverWithCar('d');
    const passenger = await seedFundedPassenger('p', 1000);
    const { trip, rides: r } = await seedTripWithRides(
      driver.userId,
      driver.car.id,
      500,
    );
    const created = await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings`)
      .set('Cookie', passenger.cookie)
      .send({ rideIds: [r[0].id] })
      .expect(201);
    const bookingId = (created.body as BookingsBatchCreatedResponseDto).items[0]
      .id;
    await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings/accept`)
      .set('Cookie', driver.cookie)
      .send({ passengerId: passenger.userId, bookingIds: [bookingId] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/bookings/${bookingId}/cancel`)
      .set('Cookie', passenger.cookie)
      .expect(204);

    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, passenger.userId));
    expect(wallet.heldCents).toBe(0);
    expect(wallet.balanceCents).toBe(1000);

    const holdRows = await db
      .select()
      .from(walletHolds)
      .where(eq(walletHolds.bookingId, bookingId));
    expect(holdRows).toHaveLength(1);
    expect(holdRows[0].status).toBe('released');
  });

  it('driver cancels ride: every accepted booking releases its hold', async () => {
    const driver = await seedDriverWithCar('d');
    const p1 = await seedFundedPassenger('p1', 1000);
    const p2 = await seedFundedPassenger('p2', 1000);
    const { trip, rides: r } = await seedTripWithRides(
      driver.userId,
      driver.car.id,
      500,
    );
    const create1 = await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings`)
      .set('Cookie', p1.cookie)
      .send({ rideIds: [r[0].id] })
      .expect(201);
    const create2 = await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings`)
      .set('Cookie', p2.cookie)
      .send({ rideIds: [r[0].id] })
      .expect(201);
    const bk1 = (create1.body as BookingsBatchCreatedResponseDto).items[0].id;
    const bk2 = (create2.body as BookingsBatchCreatedResponseDto).items[0].id;

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

    // Both hold rows should be active before cancel.
    const heldBefore = await db
      .select()
      .from(walletHolds)
      .where(eq(walletHolds.status, 'active'));
    expect(heldBefore).toHaveLength(2);

    await request(app.getHttpServer())
      .post(`/api/rides/${r[0].id}/cancel`)
      .set('Cookie', driver.cookie)
      .send({})
      .expect(204);

    const heldAfter = await db
      .select()
      .from(walletHolds)
      .where(eq(walletHolds.status, 'active'));
    expect(heldAfter).toHaveLength(0);

    const [w1] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, p1.userId));
    const [w2] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, p2.userId));
    expect(w1.heldCents).toBe(0);
    expect(w2.heldCents).toBe(0);
  });

  it('createBatch rejects when available balance is below the fare', async () => {
    const driver = await seedDriverWithCar('d');
    const passenger = await seedFundedPassenger('p', 100); // only 1€
    const { trip, rides: r } = await seedTripWithRides(
      driver.userId,
      driver.car.id,
      500, // requires 5€
    );

    const res = await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings`)
      .set('Cookie', passenger.cookie)
      .send({ rideIds: [r[0].id] })
      .expect(400);

    const body = res.body as {
      code: string;
      details: { shortfallCents: number };
    };
    expect(body.code).toBe('INSUFFICIENT_WALLET_BALANCE');
    expect(body.details.shortfallCents).toBe(400);
  });

  it('accept skips with INSUFFICIENT_WALLET_BALANCE when funds were drained between request and accept', async () => {
    const driver = await seedDriverWithCar('d');
    const passenger = await seedFundedPassenger('p', 500);
    const { trip, rides: r } = await seedTripWithRides(
      driver.userId,
      driver.car.id,
      500,
    );
    const created = await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings`)
      .set('Cookie', passenger.cookie)
      .send({ rideIds: [r[0].id] })
      .expect(201);
    const bookingId = (created.body as BookingsBatchCreatedResponseDto).items[0]
      .id;

    // Simulate funds being drained externally before the driver accepts.
    await db
      .update(wallets)
      .set({ balanceCents: 100 })
      .where(eq(wallets.userId, passenger.userId));

    const res = await request(app.getHttpServer())
      .post(`/api/trips/${trip.id}/bookings/accept`)
      .set('Cookie', driver.cookie)
      .send({ passengerId: passenger.userId, bookingIds: [bookingId] })
      .expect(200);

    const body = res.body as BookingsBatchOutcomeDto;
    expect(body.accepted).toEqual([]);
    expect(body.skipped).toEqual([
      { id: bookingId, reason: 'INSUFFICIENT_WALLET_BALANCE' },
    ]);
    // Booking stays pending; no hold was placed.
    const [bk] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(bk.status).toBe('pending');
    expect(bk.fareCents).toBeNull();
    const active = await db
      .select()
      .from(walletHolds)
      .where(eq(walletHolds.bookingId, bookingId));
    expect(active).toHaveLength(0);
  });
});
