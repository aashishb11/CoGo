import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import { bookings } from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import { BookingsExpiryService } from '@modules/trips/bookings/bookings-expiry.service';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import { makeBooking, makeCar, makeRide, makeTrip } from './helpers/factories';

const futureDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
const pastDate = (daysBehind: number) =>
  new Date(Date.now() - daysBehind * 24 * 60 * 60 * 1000);

describe('Bookings expiry sweep (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let mailService: MailService;
  let sweepService: BookingsExpiryService;

  beforeAll(async () => {
    ({ app, db, mailService } = await bootstrapTestApp());
    sweepService = app.get(BookingsExpiryService);
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

  it('only PENDING bookings on past rides flip to EXPIRED; ACCEPTED/REJECTED on past rides and PENDING on future rides untouched', async () => {
    const driver = await newUser('drv');
    const passenger = await newUser('p');
    const car = await makeCar(db, driver.userId);
    const trip = await makeTrip(db, driver.userId, { carId: car.id });

    const pastRide = await makeRide(db, trip.id, {
      scheduledDeparture: pastDate(1),
    });
    const futureRide = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(1),
    });

    const pendingPast = await makeBooking(db, passenger.userId, pastRide.id, {
      status: 'pending',
    });
    const acceptedPast = await makeBooking(db, driver.userId, pastRide.id, {
      status: 'accepted',
    });
    const rejectedPast = await makeBooking(db, driver.userId, pastRide.id, {
      status: 'rejected',
    });
    const pendingFuture = await makeBooking(
      db,
      passenger.userId,
      futureRide.id,
      { status: 'pending' },
    );

    const count = await sweepService.sweep();
    expect(count).toBe(1);

    const refresh = async (id: string) => {
      const [row] = await db
        .select({ status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, id))
        .limit(1);
      return row.status;
    };

    expect(await refresh(pendingPast.id)).toBe('expired');
    expect(await refresh(acceptedPast.id)).toBe('accepted');
    expect(await refresh(rejectedPast.id)).toBe('rejected');
    expect(await refresh(pendingFuture.id)).toBe('pending');
  });

  it('returns 0 with no error on an empty database', async () => {
    const count = await sweepService.sweep();
    expect(count).toBe(0);
  });

  it('is idempotent — a second sweep flips zero rows', async () => {
    const driver = await newUser('drv');
    const passenger = await newUser('p');
    const car = await makeCar(db, driver.userId);
    const trip = await makeTrip(db, driver.userId, { carId: car.id });
    const pastRide = await makeRide(db, trip.id, {
      scheduledDeparture: pastDate(1),
    });
    await makeBooking(db, passenger.userId, pastRide.id, { status: 'pending' });

    const first = await sweepService.sweep();
    const second = await sweepService.sweep();
    expect(first).toBe(1);
    expect(second).toBe(0);
  });
});
