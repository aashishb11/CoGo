import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { type DbClient } from '@core/database/database.module';
import { bookings, rides, trips } from '@core/database/schema';
import {
  CultucatClientError,
  CultucatClientService,
} from '@integrations/cultucat/cultucat-client.service';
import type { MailService } from '@integrations/mail/mail.service';
import type { CultucatEventPayload } from '@modules/cultucat/cultucat.types';
import type { TripDetailResponseDto } from '@modules/trips/trips/dto/trips-response.dto';
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
import { eq } from 'drizzle-orm';

const ORIGIN = { label: 'Mataró', lat: 41.5381, lng: 2.4445 };
const DESTINATION = { label: 'Barcelona', lat: 41.3851, lng: 2.1734 };

// CultuCat event 8421 sits at the festival coordinates below; any other
// numeric id is treated as a non-existent event by the stubbed client.
const CULTUCAT_EVENT: CultucatEventPayload = {
  id: 8421,
  externalId: 'EV-12345',
  title: 'Spring Festival',
  comarca: 'Barcelonès',
  municipi: 'Barcelona',
  location: 'Parc del Forum',
  lat: 41.4121,
  lng: 2.2194,
  ambits: [{ id: 1, name: 'Music' }],
  categories: [{ id: 5, name: 'Festival' }],
};
const ALL_DAYS_FALSE = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,
};

describe('Trips (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let mailService: MailService;

  const getEventById = (id: number) => {
    if (id === 8421) {
      return Promise.resolve(CULTUCAT_EVENT);
    }
    return Promise.reject(new CultucatClientError('not_found', 'No event'));
  };

  beforeAll(async () => {
    ({ app, db, mailService } = await bootstrapTestApp({
      providerOverrides: [
        {
          provide: CultucatClientService,
          useValue: { getEventById },
        },
      ],
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  // ── helpers ────────────────────────────────────────────────────────────

  const newDriver = (suffix = 'a') =>
    signUpAndVerify(app, mailService, {
      email: `driver-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: 'password123',
      name: `Driver ${suffix}`,
    });

  const seedDriverWithCar = async (suffix = 'a') => {
    const { userId, cookie } = await newDriver(suffix);
    const car = await makeCar(db, userId);
    // Trip publish now requires a trusted contact on the driver (US-05).
    await makeTrustedContact(db, userId);
    return { userId, cookie, car };
  };

  const createTripBody = (
    carId: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    carId,
    type: 'sporadic',
    origin: ORIGIN,
    destination: DESTINATION,
    musicAllowed: false,
    seatsOffered: 3,
    pricePerSeatCents: 500,
    departureAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  });

  // ── POST /trips ─────────────────────────────────────────────────────────

  describe('POST /api/trips', () => {
    it('creates a sporadic trip and exactly 1 ride at departureAt', async () => {
      const { cookie, car } = await seedDriverWithCar();
      const departureAt = new Date(
        Date.now() + 5 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const res = await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', cookie)
        .send(createTripBody(car.id, { departureAt }))
        .expect(201);

      const body = res.body as TripDetailResponseDto;
      expect(body.type).toBe('sporadic');
      expect(body.status).toBe('active');
      expect(body.carId).toBe(car.id);

      const rows = await db
        .select()
        .from(rides)
        .where(eq(rides.tripId, body.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].scheduledDeparture.toISOString()).toBe(departureAt);
      expect(rows[0].seatsOffered).toBe(3);
      expect(rows[0].seatsOccupied).toBe(0);
    });

    it('creates a recurring trip and one ride per matching weekday in window', async () => {
      const { cookie, car } = await seedDriverWithCar();

      const res = await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', cookie)
        .send({
          carId: car.id,
          type: 'recurring',
          origin: ORIGIN,
          destination: DESTINATION,
          musicAllowed: false,
          seatsOffered: 4,
          pricePerSeatCents: 500,
          schedule: {
            daysOfWeek: { ...ALL_DAYS_FALSE, monday: true, wednesday: true },
            timeOfDay: '08:30',
          },
          startDate: '2027-06-01', // Tue
          endDate: '2027-06-14', // Mon (14 days)
        })
        .expect(201);

      const body = res.body as TripDetailResponseDto;
      const rows = await db
        .select()
        .from(rides)
        .where(eq(rides.tripId, body.id));
      // Mondays: Jun 7, Jun 14 → 2; Wednesdays: Jun 2, Jun 9 → 2; total 4.
      expect(rows).toHaveLength(4);
    });

    it('creates a sporadic trip tagged with a CultuCat event when the destination is near it', async () => {
      const { cookie, car } = await seedDriverWithCar('cultucat');

      const body = createTripBody(car.id, {
        // Destination ~0.07 km from CultuCat event 8421 — within the 2 km max.
        destination: { label: 'Parc del Forum', lat: 41.4125, lng: 2.22 },
        externalEventContext: { provider: 'cultucat', eventId: '8421' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', cookie)
        .send(body)
        .expect(201);

      const response = res.body as TripDetailResponseDto;
      expect(response.externalEventContext).toEqual({
        provider: 'cultucat',
        eventId: '8421',
      });

      const [tripRow] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, response.id));
      expect(tripRow.externalEventProvider).toBe('cultucat');
      expect(tripRow.externalEventId).toBe('8421');
    });

    it('rejects a CultuCat-tagged trip whose destination is too far from the event', async () => {
      const { cookie, car } = await seedDriverWithCar('cultucat-far');

      // DESTINATION (Barcelona centre) is ~4 km from CultuCat event 8421.
      const body = createTripBody(car.id, {
        externalEventContext: { provider: 'cultucat', eventId: '8421' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', cookie)
        .send(body)
        .expect(400);

      const errorBody = res.body as { message: string };
      expect(errorBody.message).toMatch(
        /from the CultuCat event; it must be within 2 km\./,
      );
    });

    it('rejects a trip referencing a non-existent CultuCat event', async () => {
      const { cookie, car } = await seedDriverWithCar('missing-event');
      const body = createTripBody(car.id, {
        externalEventContext: { provider: 'cultucat', eventId: '999999' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', cookie)
        .send(body)
        .expect(404);

      expect(res.body).toMatchObject({
        code: 'CULTUCAT_EVENT_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('handles the Spring-forward DST gap day in Europe/Madrid', async () => {
      const { cookie, car } = await seedDriverWithCar();

      // 2027-03-28 is the Spring-forward day in Europe/Madrid; clocks jump
      // 02:00 → 03:00, so wall-clock 02:30 does not exist that day. Pinned
      // values match the helper-spec's documented `fromZonedTime` behavior.
      // (Future-dated to keep the trip-create past-date check satisfied.)
      const res = await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', cookie)
        .send({
          carId: car.id,
          type: 'recurring',
          origin: ORIGIN,
          destination: DESTINATION,
          musicAllowed: false,
          seatsOffered: 2,
          pricePerSeatCents: 500,
          schedule: {
            daysOfWeek: {
              monday: true,
              tuesday: true,
              wednesday: true,
              thursday: true,
              friday: true,
              saturday: true,
              sunday: true,
            },
            timeOfDay: '02:30',
          },
          startDate: '2027-03-27',
          endDate: '2027-03-29',
        })
        .expect(201);

      const body = res.body as TripDetailResponseDto;
      const rows = await db
        .select()
        .from(rides)
        .where(eq(rides.tripId, body.id))
        .orderBy(rides.scheduledDeparture);
      expect(rows).toHaveLength(3);
      const iso = rows.map((r) => r.scheduledDeparture.toISOString());
      expect(iso).toEqual([
        // 2027-03-27 (Sat): CET (UTC+1), 02:30 Madrid = 01:30 UTC.
        '2027-03-27T01:30:00.000Z',
        // 2027-03-28 (Sun): gap day. fromZonedTime yields 00:30 UTC.
        '2027-03-28T00:30:00.000Z',
        // 2027-03-29 (Mon): CEST (UTC+2), 02:30 Madrid = 00:30 UTC.
        '2027-03-29T00:30:00.000Z',
      ]);
    });

    it('rejects a trip whose carId is not owned by the requester', async () => {
      const { cookie } = await seedDriverWithCar('owner');
      const other = await seedDriverWithCar('other');

      await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', cookie)
        .send(createTripBody(other.car.id))
        .expect(400);
    });

    it('rejects a sporadic trip missing departureAt', async () => {
      const { cookie, car } = await seedDriverWithCar();
      const body = createTripBody(car.id);
      delete (body as Record<string, unknown>).departureAt;
      await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', cookie)
        .send(body)
        .expect(400);
    });

    it('rejects a recurring trip missing startDate/endDate', async () => {
      const { cookie, car } = await seedDriverWithCar();
      await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', cookie)
        .send({
          carId: car.id,
          type: 'recurring',
          origin: ORIGIN,
          destination: DESTINATION,
          musicAllowed: false,
          seatsOffered: 2,
          pricePerSeatCents: 500,
          schedule: {
            daysOfWeek: { ...ALL_DAYS_FALSE, monday: true },
            timeOfDay: '08:00',
          },
        })
        .expect(400);
    });

    it('rejects a sporadic trip whose departureAt is in the past', async () => {
      const { cookie, car } = await seedDriverWithCar();
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', cookie)
        .send(createTripBody(car.id, { departureAt: past }))
        .expect(400);
    });

    it('rejects a recurring trip whose endDate is before today', async () => {
      const { cookie, car } = await seedDriverWithCar();
      // Anchor a definitively-past window so this is robust regardless of
      // when the suite runs.
      await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', cookie)
        .send({
          carId: car.id,
          type: 'recurring',
          origin: ORIGIN,
          destination: DESTINATION,
          musicAllowed: false,
          seatsOffered: 2,
          pricePerSeatCents: 500,
          schedule: {
            daysOfWeek: { ...ALL_DAYS_FALSE, monday: true },
            timeOfDay: '08:00',
          },
          startDate: '2020-01-06',
          endDate: '2020-01-31',
        })
        .expect(400);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .post('/api/trips')
        .send({})
        .expect(401);
    });
  });

  // ── GET /me/trips ───────────────────────────────────────────────────────

  describe('GET /api/me/trips', () => {
    it('returns only the requesting driver trips', async () => {
      const a = await seedDriverWithCar('a');
      const b = await seedDriverWithCar('b');

      await makeTrip(db, a.userId, { carId: a.car.id });
      await makeTrip(db, a.userId, { carId: a.car.id });
      await makeTrip(db, b.userId, { carId: b.car.id });

      const res = await request(app.getHttpServer())
        .get('/api/me/trips')
        .set('Cookie', a.cookie)
        .expect(200);

      const body = res.body as { items: { driverId: string }[]; total: number };
      expect(body.total).toBe(2);
      body.items.forEach((item) => expect(item.driverId).toBe(a.userId));
    });

    it('default scope omits ARCHIVED but includes ACTIVE + CANCELLED', async () => {
      const { userId, cookie, car } = await seedDriverWithCar();
      await makeTrip(db, userId, { carId: car.id, status: 'active' });
      await makeTrip(db, userId, { carId: car.id, status: 'cancelled' });
      await makeTrip(db, userId, { carId: car.id, status: 'archived' });

      const res = await request(app.getHttpServer())
        .get('/api/me/trips')
        .set('Cookie', cookie)
        .expect(200);

      const body = res.body as { total: number; items: { status: string }[] };
      expect(body.total).toBe(2);
      const statuses = new Set(body.items.map((i) => i.status));
      expect(statuses).toEqual(new Set(['active', 'cancelled']));
    });

    it('filters by status=CANCELLED (case-insensitive)', async () => {
      const { userId, cookie, car } = await seedDriverWithCar();
      await makeTrip(db, userId, { carId: car.id, status: 'active' });
      await makeTrip(db, userId, { carId: car.id, status: 'cancelled' });

      const res = await request(app.getHttpServer())
        .get('/api/me/trips?status=CANCELLED')
        .set('Cookie', cookie)
        .expect(200);

      const body = res.body as { total: number; items: { status: string }[] };
      expect(body.total).toBe(1);
      expect(body.items[0].status).toBe('cancelled');
    });

    it('filters by status=ARCHIVED', async () => {
      const { userId, cookie, car } = await seedDriverWithCar();
      await makeTrip(db, userId, { carId: car.id, status: 'archived' });
      await makeTrip(db, userId, { carId: car.id, status: 'active' });

      const res = await request(app.getHttpServer())
        .get('/api/me/trips?status=ARCHIVED')
        .set('Cookie', cookie)
        .expect(200);

      const body = res.body as { total: number; items: { status: string }[] };
      expect(body.total).toBe(1);
      expect(body.items[0].status).toBe('archived');
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer()).get('/api/me/trips').expect(401);
    });
  });

  // ── GET /trips/:id ──────────────────────────────────────────────────────

  describe('GET /api/trips/:id', () => {
    it('requires an authenticated session', async () => {
      const { userId, car } = await seedDriverWithCar();
      const trip = await makeTrip(db, userId, { carId: car.id });
      await request(app.getHttpServer())
        .get(`/api/trips/${trip.id}`)
        .expect(401);
    });

    it('returns the trip detail to any authenticated user', async () => {
      const a = await seedDriverWithCar('a');
      const b = await seedDriverWithCar('b');
      const trip = await makeTrip(db, a.userId, { carId: a.car.id });

      const res = await request(app.getHttpServer())
        .get(`/api/trips/${trip.id}`)
        .set('Cookie', b.cookie)
        .expect(200);

      const body = res.body as TripDetailResponseDto;
      expect(body.id).toBe(trip.id);
      expect(body.driverId).toBe(a.userId);
    });

    it('returns 404 for an unknown trip id', async () => {
      const { cookie } = await seedDriverWithCar();
      await request(app.getHttpServer())
        .get('/api/trips/non-existent-id')
        .set('Cookie', cookie)
        .expect(404);
    });
  });

  // ── PATCH /trips/:id ────────────────────────────────────────────────────

  describe('PATCH /api/trips/:id', () => {
    it('non-sensitive change succeeds even with accepted bookings on a future ride', async () => {
      const driver = await seedDriverWithCar();
      const passenger = await newDriver('p');

      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() + 24 * 60 * 60 * 1000),
        seatsOffered: 3,
        seatsOccupied: 1,
      });
      await makeBooking(db, passenger.userId, ride.id, { status: 'accepted' });

      await request(app.getHttpServer())
        .patch(`/api/trips/${trip.id}`)
        .set('Cookie', driver.cookie)
        .send({ musicAllowed: true })
        .expect(200);

      const [refreshed] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, trip.id));
      expect(refreshed.musicAllowed).toBe(true);
    });

    it('sensitive edit returns 409 ACTIVE_BOOKINGS_PRESENT when blocking bookings exist', async () => {
      const driver = await seedDriverWithCar();
      const passenger = await newDriver('p');

      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const ride1 = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      const ride2 = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      });
      await makeBooking(db, passenger.userId, ride1.id, { status: 'accepted' });
      // ride2 has no blocking booking

      const res = await request(app.getHttpServer())
        .patch(`/api/trips/${trip.id}`)
        .set('Cookie', driver.cookie)
        .send({ seatsOffered: 5 })
        .expect(409);

      expect(res.body).toMatchObject({
        code: 'ACTIVE_BOOKINGS_PRESENT',
        details: { count: 1 },
      });
      expect(
        (res.body as { details: { rideIds: string[] } }).details.rideIds,
      ).toEqual([ride1.id]);

      // not modified
      const [refreshed] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, trip.id));
      expect(refreshed.seatsOffered).toBe(trip.seatsOffered);
      const [rideRow] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, ride2.id));
      expect(rideRow.seatsOffered).toBe(ride2.seatsOffered);
    });

    it('sensitive edit succeeds and re-snapshots future ACTIVE rides when no blocking bookings', async () => {
      const driver = await seedDriverWithCar();
      const passenger = await newDriver('p');

      const trip = await makeTrip(db, driver.userId, {
        carId: driver.car.id,
        seatsOffered: 3,
      });
      const future1 = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() + 24 * 60 * 60 * 1000),
        seatsOffered: 3,
      });
      const future2 = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        seatsOffered: 3,
      });
      const past = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() - 24 * 60 * 60 * 1000),
        seatsOffered: 3,
      });
      // pending booking on a past ride does NOT block (precheck filters by future)
      await makeBooking(db, passenger.userId, past.id, { status: 'pending' });

      await request(app.getHttpServer())
        .patch(`/api/trips/${trip.id}`)
        .set('Cookie', driver.cookie)
        .send({ seatsOffered: 5 })
        .expect(200);

      const [refreshed] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, trip.id));
      expect(refreshed.seatsOffered).toBe(5);

      const futureRows = await db
        .select()
        .from(rides)
        .where(eq(rides.tripId, trip.id));
      const idToSeats = new Map(futureRows.map((r) => [r.id, r.seatsOffered]));
      expect(idToSeats.get(future1.id)).toBe(5);
      expect(idToSeats.get(future2.id)).toBe(5);
      // past ride is untouched
      expect(idToSeats.get(past.id)).toBe(3);
    });

    it('rejects 400 when a schedule field is included', async () => {
      const driver = await seedDriverWithCar();
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });

      for (const body of [
        { departureAt: new Date().toISOString() },
        {
          schedule: {
            daysOfWeek: { ...ALL_DAYS_FALSE, monday: true },
            timeOfDay: '08:00',
          },
        },
        { startDate: '2026-04-01' },
        { endDate: '2026-04-30' },
      ]) {
        await request(app.getHttpServer())
          .patch(`/api/trips/${trip.id}`)
          .set('Cookie', driver.cookie)
          .send(body)
          .expect(400);
      }
    });

    it('returns 403 when a non-driver attempts to edit', async () => {
      const driver = await seedDriverWithCar('a');
      const other = await seedDriverWithCar('b');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });

      await request(app.getHttpServer())
        .patch(`/api/trips/${trip.id}`)
        .set('Cookie', other.cookie)
        .send({ musicAllowed: true })
        .expect(403);
    });

    it('returns 404 on a non-existent trip', async () => {
      const driver = await seedDriverWithCar();
      await request(app.getHttpServer())
        .patch('/api/trips/non-existent-id')
        .set('Cookie', driver.cookie)
        .send({ musicAllowed: true })
        .expect(404);
    });
  });

  // ── POST /trips/:id/cancel ──────────────────────────────────────────────

  describe('POST /api/trips/:id/cancel', () => {
    it('cancels trip, future ACTIVE rides, and their non-terminal bookings; past rides untouched', async () => {
      const driver = await seedDriverWithCar();
      const passenger = await newDriver('p');

      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const future = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      const past = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      const futureBooking = await makeBooking(db, passenger.userId, future.id, {
        status: 'accepted',
      });
      const pastBooking = await makeBooking(db, passenger.userId, past.id, {
        status: 'accepted',
      });

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/cancel`)
        .set('Cookie', driver.cookie)
        .send({ cancellationReason: 'unavailable' })
        .expect(204);

      const [refreshed] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, trip.id));
      expect(refreshed.status).toBe('cancelled');
      expect(refreshed.cancellationReason).toBe('unavailable');
      expect(refreshed.cancelledAt).not.toBeNull();

      const rideRows = await db
        .select()
        .from(rides)
        .where(eq(rides.tripId, trip.id));
      const futureRow = rideRows.find((r) => r.id === future.id)!;
      const pastRow = rideRows.find((r) => r.id === past.id)!;
      expect(futureRow.status).toBe('cancelled');
      expect(pastRow.status).toBe('active');

      const [futureBookingRow] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, futureBooking.id));
      expect(futureBookingRow.status).toBe('rejected');
      const [pastBookingRow] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, pastBooking.id));
      expect(pastBookingRow.status).toBe('accepted');
    });

    it('returns 403 when a non-driver attempts to cancel', async () => {
      const driver = await seedDriverWithCar('a');
      const other = await seedDriverWithCar('b');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/cancel`)
        .set('Cookie', other.cookie)
        .send({})
        .expect(403);
    });

    it('returns 404 on a non-existent trip', async () => {
      const driver = await seedDriverWithCar();
      await request(app.getHttpServer())
        .post('/api/trips/non-existent-id/cancel')
        .set('Cookie', driver.cookie)
        .send({})
        .expect(404);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .post('/api/trips/non-existent-id/cancel')
        .send({})
        .expect(401);
    });
  });
});
