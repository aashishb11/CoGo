import { jest } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import {
  bookings,
  rides,
  trips,
  walletHolds,
  wallets,
} from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import { RidesSweepService } from '@modules/trips/rides/rides-sweep.service';
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

const minutes = (m: number) => m * 60 * 1000;
const hours = (h: number) => h * 60 * 60 * 1000;

describe('Rides sweep cron (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let mailService: MailService;
  let sweep: RidesSweepService;

  beforeAll(async () => {
    ({ app, db, mailService } = await bootstrapTestApp());
    sweep = app.get(RidesSweepService);
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

  describe('idle in-progress branch', () => {
    it('auto-completes a ride started more than 6h ago with default settlement', async () => {
      const driver = await seedDriverWithCar('drv');
      const passenger = await seedFundedPassenger('p', 1000);
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      await db
        .update(trips)
        .set({ pricePerSeatCents: 500 })
        .where(eq(trips.id, trip.id));
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() - hours(8)),
        status: 'in_progress',
        startedAt: new Date(Date.now() - hours(7)),
      });
      // Seed an accepted booking with an active hold so the sweep
      // exercises the no-show capture default path.
      const booking = await makeBooking(db, passenger.userId, ride.id, {
        status: 'accepted',
        fareCents: 500,
      });
      await db
        .update(wallets)
        .set({ heldCents: 500 })
        .where(eq(wallets.userId, passenger.userId));
      await db.insert(walletHolds).values({
        id: 'h1',
        walletId: passenger.userId,
        bookingId: booking.id,
        amountCents: 500,
        status: 'active',
      });

      const result = await sweep.sweep();
      expect(result.completed).toBe(1);

      const [refreshed] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, ride.id));
      expect(refreshed.status).toBe('completed');
      expect(refreshed.completedAt).not.toBeNull();

      // No-show capture: hold flipped to captured, passenger debited.
      const [hold] = await db
        .select()
        .from(walletHolds)
        .where(eq(walletHolds.bookingId, booking.id));
      expect(hold.status).toBe('captured');

      const [walletAfter] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, passenger.userId));
      expect(walletAfter.balanceCents).toBe(500);
      expect(walletAfter.heldCents).toBe(0);
    });

    it('leaves rides started less than 6h ago alone', async () => {
      const driver = await seedDriverWithCar('drv');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() - minutes(30)),
        status: 'in_progress',
        startedAt: new Date(Date.now() - minutes(30)),
      });
      const result = await sweep.sweep();
      expect(result.completed).toBe(0);
      const [refreshed] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, ride.id));
      expect(refreshed.status).toBe('in_progress');
    });
  });

  describe('stranded-active branch', () => {
    it('cancels stranded active rides, releases holds, expires pending bookings', async () => {
      const driver = await seedDriverWithCar('drv');
      const passenger = await seedFundedPassenger('p', 1000);
      const pending = await seedFundedPassenger('p_pending', 0);
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      await db
        .update(trips)
        .set({ pricePerSeatCents: 500 })
        .where(eq(trips.id, trip.id));
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() - hours(8)),
        status: 'active',
      });
      const accepted = await makeBooking(db, passenger.userId, ride.id, {
        status: 'accepted',
        fareCents: 500,
      });
      const pendingBooking = await makeBooking(db, pending.userId, ride.id, {
        status: 'pending',
      });
      await db
        .update(wallets)
        .set({ heldCents: 500 })
        .where(eq(wallets.userId, passenger.userId));
      await db.insert(walletHolds).values({
        id: 'h1',
        walletId: passenger.userId,
        bookingId: accepted.id,
        amountCents: 500,
        status: 'active',
      });

      const result = await sweep.sweep();
      expect(result.cancelled).toBe(1);

      const [refreshed] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, ride.id));
      expect(refreshed.status).toBe('cancelled');
      expect(refreshed.cancellationReason).toBe('driver_no_show');

      const [acceptedRefreshed] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, accepted.id));
      expect(acceptedRefreshed.status).toBe('rejected');

      const [pendingRefreshed] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, pendingBooking.id));
      expect(pendingRefreshed.status).toBe('expired');

      const [hold] = await db
        .select()
        .from(walletHolds)
        .where(eq(walletHolds.bookingId, accepted.id));
      expect(hold.status).toBe('released');

      const [walletAfter] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, passenger.userId));
      expect(walletAfter.balanceCents).toBe(1000);
      expect(walletAfter.heldCents).toBe(0);
    });

    it('leaves active rides whose scheduled_departure is recent alone', async () => {
      const driver = await seedDriverWithCar('drv');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() - minutes(30)),
        status: 'active',
      });
      const result = await sweep.sweep();
      expect(result.cancelled).toBe(0);
      const [refreshed] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, ride.id));
      expect(refreshed.status).toBe('active');
    });
  });

  describe('orphan-hold backstop', () => {
    it('releases an active hold whose booking is terminal and logs an error', async () => {
      const driver = await seedDriverWithCar('drv');
      const passenger = await seedFundedPassenger('p', 1000);
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() + hours(1)),
        status: 'active',
      });
      const booking = await makeBooking(db, passenger.userId, ride.id, {
        // Terminal booking but the hold somehow stayed active — the bug
        // the backstop is designed to surface.
        status: 'cancelled',
        cancelledAt: new Date(),
      });
      await db
        .update(wallets)
        .set({ heldCents: 500 })
        .where(eq(wallets.userId, passenger.userId));
      await db.insert(walletHolds).values({
        id: 'orphan_h',
        walletId: passenger.userId,
        bookingId: booking.id,
        amountCents: 500,
        status: 'active',
      });

      const loggerSpy = jest
        .spyOn(sweep['logger'], 'error')
        .mockImplementation(() => undefined);

      const result = await sweep.sweep();
      expect(result.orphanHoldsReleased).toBe(1);

      const [walletAfter] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, passenger.userId));
      expect(walletAfter.heldCents).toBe(0);

      const [hold] = await db
        .select()
        .from(walletHolds)
        .where(eq(walletHolds.bookingId, booking.id));
      expect(hold.status).toBe('released');

      const orphanCalls = loggerSpy.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('orphan hold released'),
      );
      expect(orphanCalls).toHaveLength(1);
      loggerSpy.mockRestore();
    });

    it('is a no-op on an empty database', async () => {
      const result = await sweep.sweep();
      expect(result).toEqual({
        completed: 0,
        cancelled: 0,
        orphanHoldsReleased: 0,
      });
    });
  });
});
