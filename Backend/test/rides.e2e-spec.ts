import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import {
  bookings,
  carModels,
  cars,
  rides,
  trips,
  user,
} from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import type { BookingResponseDto } from '@modules/trips/bookings/dto/bookings-response.dto';
import type {
  RideDetailResponseDto,
  RideListResponseDto,
  RideSearchResponseDto,
} from '@modules/trips/rides/dto/rides-response.dto';
import { DOMAIN_EVENTS } from '@shared/events/event-names';
import type { RideCompletedPayload } from '@shared/events/payloads';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import {
  makeBooking,
  makeCar,
  makeCarModel,
  makeOrganization,
  makeRide,
  makeTrip,
} from './helpers/factories';

const futureDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

const pastDate = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

describe('Rides (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let mailService: MailService;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    ({ app, db, mailService } = await bootstrapTestApp());
    eventEmitter = app.get(EventEmitter2);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  // ── helpers ────────────────────────────────────────────────────────────

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

  const seedTripWithRides = async (
    driverId: string,
    carId: string,
    rideOpts: Array<Partial<Parameters<typeof makeRide>[2]>> = [{}],
    tripOpts: Partial<Parameters<typeof makeTrip>[2]> = {},
  ) => {
    const trip = await makeTrip(db, driverId, {
      carId,
      seatsOffered: 3,
      ...tripOpts,
    });
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
  // GET /rides
  // ───────────────────────────────────────────────────────────────────────

  describe('GET /api/rides (search)', () => {
    const ORIGIN_LAT = 41.5381;
    const ORIGIN_LNG = 2.4445;
    const DEST_LAT = 41.3851;
    const DEST_LNG = 2.1734;

    // 2026-04-15T22:30 UTC === 2026-04-16T00:30 Madrid (CEST, UTC+2)
    const MADRID_DATE = '2026-04-16';
    const RIDE_INSTANT = new Date('2026-04-15T22:30:00.000Z');
    const SAME_DAY_LATER = new Date('2026-04-16T07:00:00.000Z');

    const seedSearchScenario = async (
      passenger: { cookie: string[] },
      perRide: Array<Partial<Parameters<typeof makeRide>[2]>>,
    ) => {
      const driver = await seedDriverWithCar('search-driver');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        perRide,
      );
      return { driver, trip, rides: r, passenger };
    };

    it('returns only ACTIVE rides with enough free seats inside the bbox, sorted by departure asc, with parent trip metadata', async () => {
      const passenger = await newUser('p');
      const driver = await seedDriverWithCar('d');

      const ridesPlan: Array<Partial<Parameters<typeof makeRide>[2]>> = [
        {
          // Match: ACTIVE, 2 free seats, in bbox, on date
          status: 'active',
          scheduledDeparture: SAME_DAY_LATER,
          seatsOffered: 3,
          seatsOccupied: 1,
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
        },
        {
          // Match: earlier on same day → must come first
          status: 'active',
          scheduledDeparture: RIDE_INSTANT,
          seatsOffered: 3,
          seatsOccupied: 0,
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
        },
        {
          // Skip: not active
          status: 'cancelled',
          scheduledDeparture: SAME_DAY_LATER,
          seatsOffered: 3,
          seatsOccupied: 0,
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
        },
        {
          // Skip: full
          status: 'active',
          scheduledDeparture: SAME_DAY_LATER,
          seatsOffered: 1,
          seatsOccupied: 1,
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
        },
        {
          // Skip: outside origin bbox (~50 km north)
          status: 'active',
          scheduledDeparture: SAME_DAY_LATER,
          seatsOffered: 3,
          seatsOccupied: 0,
          originLat: ORIGIN_LAT + 0.5,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
        },
        {
          // Skip: different day
          status: 'active',
          scheduledDeparture: new Date('2026-04-18T08:00:00.000Z'),
          seatsOffered: 3,
          seatsOccupied: 0,
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
        },
      ];
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        ridesPlan,
      );

      const res = await request(app.getHttpServer())
        .get('/api/rides')
        .query({
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
          date: MADRID_DATE,
          radiusKm: 5,
          seatsNeeded: 1,
        })
        .set('Cookie', passenger.cookie)
        .expect(200);

      const body = res.body as RideSearchResponseDto;
      expect(body.total).toBe(2);
      expect(body.items.map((i) => i.id)).toEqual([r[1].id, r[0].id]);
      const first = body.items[0];
      expect(first.trip.driverId).toBe(driver.userId);
      expect(first.trip.tripType).toBe('sporadic');
      expect(first.trip.driverName).toBeTruthy();
    });

    it('excludes rides where (seatsOffered - seatsOccupied) < seatsNeeded', async () => {
      const passenger = await newUser('p');
      const { rides: r } = await seedSearchScenario(passenger, [
        {
          scheduledDeparture: SAME_DAY_LATER,
          seatsOffered: 3,
          seatsOccupied: 2,
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
        },
        {
          scheduledDeparture: SAME_DAY_LATER,
          seatsOffered: 3,
          seatsOccupied: 1,
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/rides')
        .query({
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
          date: MADRID_DATE,
          radiusKm: 5,
          seatsNeeded: 2,
        })
        .set('Cookie', passenger.cookie)
        .expect(200);

      const body = res.body as RideSearchResponseDto;
      expect(body.total).toBe(1);
      expect(body.items[0].id).toBe(r[1].id);
    });

    it('respects the Europe/Madrid date boundary', async () => {
      const passenger = await newUser('p');
      // 2026-04-15T22:30Z = 2026-04-16T00:30 Madrid → matches date=2026-04-16.
      // 2026-04-15T21:30Z = 2026-04-15T23:30 Madrid → does NOT match.
      const { rides: r } = await seedSearchScenario(passenger, [
        {
          scheduledDeparture: RIDE_INSTANT,
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
        },
        {
          scheduledDeparture: new Date('2026-04-15T21:30:00.000Z'),
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/rides')
        .query({
          originLat: ORIGIN_LAT,
          originLng: ORIGIN_LNG,
          destinationLat: DEST_LAT,
          destinationLng: DEST_LNG,
          date: MADRID_DATE,
          radiusKm: 5,
        })
        .set('Cookie', passenger.cookie)
        .expect(200);

      const body = res.body as RideSearchResponseDto;
      expect(body.total).toBe(1);
      expect(body.items[0].id).toBe(r[0].id);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // GET /trips/:tripId/rides
  // ───────────────────────────────────────────────────────────────────────

  describe('GET /api/trips/:tripId/rides', () => {
    it('default scope returns ACTIVE + COMPLETED, excludes CANCELLED', async () => {
      const driver = await seedDriverWithCar('d');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [
          { status: 'active', scheduledDeparture: futureDate(1) },
          { status: 'completed', scheduledDeparture: futureDate(2) },
          { status: 'cancelled', scheduledDeparture: futureDate(3) },
        ],
      );

      const res = await request(app.getHttpServer())
        .get(`/api/trips/${trip.id}/rides`)
        .set('Cookie', driver.cookie)
        .expect(200);

      const body = res.body as RideListResponseDto;
      const ids = new Set(body.items.map((i) => i.id));
      expect(ids).toEqual(new Set([r[0].id, r[1].id]));
    });

    it('?status=CANCELLED includes only cancelled rides', async () => {
      const driver = await seedDriverWithCar('d');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [
          { status: 'active', scheduledDeparture: futureDate(1) },
          { status: 'cancelled', scheduledDeparture: futureDate(2) },
        ],
      );

      const res = await request(app.getHttpServer())
        .get(`/api/trips/${trip.id}/rides?status=CANCELLED`)
        .set('Cookie', driver.cookie)
        .expect(200);

      const body = res.body as RideListResponseDto;
      expect(body.items.map((i) => i.id)).toEqual([r[1].id]);
    });

    it('filters by from/to scheduledDeparture window', async () => {
      const driver = await seedDriverWithCar('d');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [
          { scheduledDeparture: futureDate(1) },
          { scheduledDeparture: futureDate(5) },
          { scheduledDeparture: futureDate(10) },
        ],
      );

      const from = futureDate(3).toISOString();
      const to = futureDate(7).toISOString();
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${trip.id}/rides?from=${from}&to=${to}`)
        .set('Cookie', driver.cookie)
        .expect(200);

      const body = res.body as RideListResponseDto;
      expect(body.items.map((i) => i.id)).toEqual([r[1].id]);
    });

    it('returns 404 for unknown trip', async () => {
      const u = await newUser('u');
      await request(app.getHttpServer())
        .get('/api/trips/missing/rides')
        .set('Cookie', u.cookie)
        .expect(404);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // GET /rides/:rideId
  // ───────────────────────────────────────────────────────────────────────

  describe('GET /api/rides/:rideId', () => {
    it('returns ride detail with trip + driver enrichment for any authenticated user', async () => {
      const driver = await seedDriverWithCar('d');
      const stranger = await newUser('s');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );

      const res = await request(app.getHttpServer())
        .get(`/api/rides/${r[0].id}`)
        .set('Cookie', stranger.cookie)
        .expect(200);

      const body = res.body as RideDetailResponseDto;
      expect(body.id).toBe(r[0].id);
      expect(body.tripId).toBe(trip.id);
      expect(body.trip.driverId).toBe(driver.userId);
      expect(body.trip.driverName).toBeTruthy();
    });

    it('returns 404 for unknown ride', async () => {
      const u = await newUser('u');
      await request(app.getHttpServer())
        .get('/api/rides/missing')
        .set('Cookie', u.cookie)
        .expect(404);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer()).get('/api/rides/anything').expect(401);
    });

    it('exposes driverOrganization on the trip summary when the driver is linked', async () => {
      const driver = await seedDriverWithCar('orgdriver');
      const stranger = await newUser('s2');
      const org = await makeOrganization(db, {
        name: 'UPC',
        domain: 'rides-trust.edu',
      });
      await db
        .update(user)
        .set({ organizationId: org.id })
        .where(eq(user.id, driver.userId));

      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );

      const res = await request(app.getHttpServer())
        .get(`/api/rides/${r[0].id}`)
        .set('Cookie', stranger.cookie)
        .expect(200);

      const body = res.body as RideDetailResponseDto;
      expect(body.trip.driverOrganization).toEqual({
        id: org.id,
        name: 'UPC',
      });
    });

    it('returns driverOrganization=null when the driver is not linked', async () => {
      const driver = await seedDriverWithCar('soloDriver');
      const stranger = await newUser('s3');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );

      const res = await request(app.getHttpServer())
        .get(`/api/rides/${r[0].id}`)
        .set('Cookie', stranger.cookie)
        .expect(200);

      const body = res.body as RideDetailResponseDto;
      expect(body.trip.driverOrganization).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // POST /rides/:rideId/cancel
  // ───────────────────────────────────────────────────────────────────────

  describe('POST /api/rides/:rideId/cancel', () => {
    it('driver cancels: ride → CANCELLED, non-terminal bookings → REJECTED, seat counter frozen', async () => {
      const driver = await seedDriverWithCar('d');
      const passenger = await newUser('p');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ seatsOccupied: 2 }],
      );
      const accepted = await makeBooking(db, passenger.userId, r[0].id, {
        status: 'accepted',
      });
      const pending = await makeBooking(
        db,
        (await newUser('p2')).userId,
        r[0].id,
        {
          status: 'pending',
        },
      );

      await request(app.getHttpServer())
        .post(`/api/rides/${r[0].id}/cancel`)
        .set('Cookie', driver.cookie)
        .send({ cancellationReason: 'weather' })
        .expect(204);

      const [refreshed] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, r[0].id));
      expect(refreshed.status).toBe('cancelled');
      expect(refreshed.cancelledAt).not.toBeNull();
      expect(refreshed.cancellationReason).toBe('weather');
      // Counter frozen at cancel time.
      expect(refreshed.seatsOccupied).toBe(2);

      const all = await db.select().from(bookings);
      const byId = new Map(all.map((b) => [b.id, b]));
      expect(byId.get(accepted.id)!.status).toBe('rejected');
      expect(byId.get(pending.id)!.status).toBe('rejected');
    });

    it('returns 403 to a non-driver and 404 for unknown rides', async () => {
      const driver = await seedDriverWithCar('d');
      const other = await seedDriverWithCar('other');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );

      await request(app.getHttpServer())
        .post(`/api/rides/${r[0].id}/cancel`)
        .set('Cookie', other.cookie)
        .send({})
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/rides/missing/cancel')
        .set('Cookie', driver.cookie)
        .send({})
        .expect(404);
    });

    it('cancelling the only future-active ride of a sporadic trip auto-archives the trip', async () => {
      const driver = await seedDriverWithCar('d');
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );

      await request(app.getHttpServer())
        .post(`/api/rides/${r[0].id}/cancel`)
        .set('Cookie', driver.cookie)
        .send({})
        .expect(204);

      const [refreshedTrip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, trip.id));
      expect(refreshedTrip.status).toBe('archived');
      expect(refreshedTrip.archivedAt).not.toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // POST /rides/:rideId/complete
  // ───────────────────────────────────────────────────────────────────────

  describe('POST /api/rides/:rideId/complete', () => {
    const seedTripWithCo2 = async (suffix = 'c', co2KgPerKm = 0.2) => {
      const { userId, cookie } = await newUser(`drv-${suffix}`);
      const carModel = await makeCarModel(db, { co2KgPerKm });
      const car = await makeCar(db, userId, { modelId: carModel.id });
      return { userId, cookie, car, carModel };
    };

    it('happy path: status, completedAt, frozen actualCo2SavedKg, unaffected by later carModel changes', async () => {
      const driver = await seedTripWithCo2('happy', 0.2);
      const passenger = await newUser('p');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [
          {
            totalDistanceKm: 30,
            seatsOffered: 3,
            seatsOccupied: 2,
            scheduledDeparture: pastDate(1),
          },
        ],
      );
      // 2 ACCEPTED + BOARDED passengers. Under the new contract,
      // `actualCo2SavedKg` is derived from passengers with `boardedAt`
      // set (boarded scans or post-complete 'boarded' override) — a
      // captured no-show still leaves `boardedAt` null and does not
      // count for CO2.
      const p2 = await newUser('p2');
      await makeBooking(db, passenger.userId, r[0].id, {
        status: 'accepted',
        boardedAt: pastDate(1),
      });
      await makeBooking(db, p2.userId, r[0].id, {
        status: 'accepted',
        boardedAt: pastDate(1),
      });

      const res = await request(app.getHttpServer())
        .post(`/api/rides/${r[0].id}/complete`)
        .set('Cookie', driver.cookie)
        .send({})
        .expect(200);

      const body = res.body as RideDetailResponseDto;
      expect(body.status).toBe('completed');
      expect(body.completedAt).not.toBeNull();
      // 2 * 30 * 0.2 = 12
      expect(body.actualCo2SavedKg).toBeCloseTo(12, 2);
      expect(body.seatsOccupied).toBe(2);

      // Mutating model afterwards must not change the frozen value.
      await db
        .update(carModels)
        .set({ co2KgPerKm: 0.5 })
        .where(eq(carModels.id, driver.carModel.id));
      await db
        .update(cars)
        .set({ passengerSeats: 9 })
        .where(eq(cars.id, driver.car.id));

      const reread = await request(app.getHttpServer())
        .get(`/api/rides/${r[0].id}`)
        .set('Cookie', driver.cookie)
        .expect(200);
      expect(
        (reread.body as RideDetailResponseDto).actualCo2SavedKg,
      ).toBeCloseTo(12, 2);
    });

    it('unscannedOutcomes override: boarded promotes an unscanned booking and counts for CO2', async () => {
      const driver = await seedTripWithCo2('override', 0.1);
      const p1 = await newUser('p1');
      const p2 = await newUser('p2');
      const p3 = await newUser('p3');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [
          {
            totalDistanceKm: 10,
            seatsOffered: 4,
            seatsOccupied: 3,
            scheduledDeparture: pastDate(1),
          },
        ],
      );
      const b1 = await makeBooking(db, p1.userId, r[0].id, {
        status: 'accepted',
        boardedAt: pastDate(1),
      });
      const b2 = await makeBooking(db, p2.userId, r[0].id, {
        status: 'accepted',
      });
      const b3 = await makeBooking(db, p3.userId, r[0].id, {
        status: 'accepted',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/rides/${r[0].id}/complete`)
        .set('Cookie', driver.cookie)
        .send({
          unscannedOutcomes: [
            { bookingId: b2.id, outcome: 'boarded' },
            { bookingId: b3.id, outcome: 'refund' },
          ],
        })
        .expect(200);

      const body = res.body as RideDetailResponseDto;
      // b1 (scanned) + b2 (boarded override) = 2 boarded; b3 refunded.
      expect(body.seatsOccupied).toBe(2);
      // 2 * 10 * 0.1 = 2
      expect(body.actualCo2SavedKg).toBeCloseTo(2, 2);
      // Sanity: b1 still has its boardedAt, b2 stamped to now, b3 stays
      // null.
      const refreshed = await db.select().from(bookings);
      const byId = new Map(refreshed.map((b) => [b.id, b]));
      expect(byId.get(b1.id)!.boardedAt).not.toBeNull();
      expect(byId.get(b2.id)!.boardedAt).not.toBeNull();
      expect(byId.get(b3.id)!.boardedAt).toBeNull();
    });

    it('completing the only active ride auto-archives the sporadic trip', async () => {
      const driver = await seedTripWithCo2();
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ scheduledDeparture: pastDate(1) }],
      );

      await request(app.getHttpServer())
        .post(`/api/rides/${r[0].id}/complete`)
        .set('Cookie', driver.cookie)
        .send({})
        .expect(200);

      const [refreshedTrip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, trip.id));
      expect(refreshedTrip.status).toBe('archived');
    });

    it('does not archive when other future-active rides remain on the trip', async () => {
      const driver = await seedTripWithCo2();
      const { trip, rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [
          { scheduledDeparture: pastDate(1) },
          { scheduledDeparture: futureDate(2) },
        ],
      );

      await request(app.getHttpServer())
        .post(`/api/rides/${r[0].id}/complete`)
        .set('Cookie', driver.cookie)
        .send({})
        .expect(200);

      const [refreshedTrip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, trip.id));
      expect(refreshedTrip.status).toBe('active');
    });

    it('emits RIDE_COMPLETED exactly once with driver + ACCEPTED passenger recipients', async () => {
      const driver = await seedTripWithCo2('emit', 0.2);
      const p1 = await newUser('p1');
      const p2 = await newUser('p2');
      const p3 = await newUser('p3');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [
          {
            totalDistanceKm: 50,
            seatsOffered: 3,
            seatsOccupied: 2,
            scheduledDeparture: pastDate(1),
          },
        ],
      );
      await makeBooking(db, p1.userId, r[0].id, {
        status: 'accepted',
        boardedAt: pastDate(1),
      });
      await makeBooking(db, p2.userId, r[0].id, {
        status: 'accepted',
        boardedAt: pastDate(1),
      });
      await makeBooking(db, p3.userId, r[0].id, { status: 'pending' });

      const received: RideCompletedPayload[] = [];
      const handler = (payload: RideCompletedPayload) => {
        received.push(payload);
      };
      eventEmitter.on(DOMAIN_EVENTS.RIDE_COMPLETED, handler);

      try {
        await request(app.getHttpServer())
          .post(`/api/rides/${r[0].id}/complete`)
          .set('Cookie', driver.cookie)
          .send({})
          .expect(200);
      } finally {
        eventEmitter.off(DOMAIN_EVENTS.RIDE_COMPLETED, handler);
      }

      expect(received).toHaveLength(1);
      const payload = received[0];
      expect(payload.rideId).toBe(r[0].id);
      // 2 * 50 * 0.2 = 20
      expect(payload.actualCo2SavedKg).toBeCloseTo(20, 2);
      expect(new Set(payload.recipientUserIds)).toEqual(
        new Set([driver.userId, p1.userId, p2.userId]),
      );
    });

    it('rejects completing an already-completed or cancelled ride with 409', async () => {
      const driver = await seedTripWithCo2();
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ status: 'completed' }, { status: 'cancelled' }],
      );

      await request(app.getHttpServer())
        .post(`/api/rides/${r[0].id}/complete`)
        .set('Cookie', driver.cookie)
        .send({})
        .expect(409);

      await request(app.getHttpServer())
        .post(`/api/rides/${r[1].id}/complete`)
        .set('Cookie', driver.cookie)
        .send({})
        .expect(409);
    });

    it('rejects completing a ride before its scheduled departure with 400', async () => {
      const driver = await seedTripWithCo2();
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ scheduledDeparture: futureDate(1) }],
      );

      await request(app.getHttpServer())
        .post(`/api/rides/${r[0].id}/complete`)
        .set('Cookie', driver.cookie)
        .send({})
        .expect(400);
    });

    it('returns 403 to a non-driver and 404 for unknown ride', async () => {
      const driver = await seedTripWithCo2();
      const other = await seedDriverWithCar('other');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{ scheduledDeparture: pastDate(1) }],
      );

      await request(app.getHttpServer())
        .post(`/api/rides/${r[0].id}/complete`)
        .set('Cookie', other.cookie)
        .send({})
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/rides/missing/complete')
        .set('Cookie', driver.cookie)
        .send({})
        .expect(404);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // GET /rides/:rideId/bookings
  // ───────────────────────────────────────────────────────────────────────

  describe('GET /api/rides/:rideId/bookings', () => {
    it('driver sees all bookings sorted by requestedAt asc', async () => {
      const driver = await seedDriverWithCar('d');
      const p1 = await newUser('p1');
      const p2 = await newUser('p2');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );
      const earlier = await makeBooking(db, p2.userId, r[0].id, {
        requestedAt: new Date(Date.now() - 60_000),
      });
      const later = await makeBooking(db, p1.userId, r[0].id, {
        requestedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get(`/api/rides/${r[0].id}/bookings`)
        .set('Cookie', driver.cookie)
        .expect(200);

      const body = res.body as BookingResponseDto[];
      expect(body.map((b) => b.id)).toEqual([earlier.id, later.id]);
    });

    it('returns 403 to a non-driver, 404 for unknown ride', async () => {
      const driver = await seedDriverWithCar('d');
      const other = await seedDriverWithCar('o');
      const { rides: r } = await seedTripWithRides(
        driver.userId,
        driver.car.id,
        [{}],
      );

      await request(app.getHttpServer())
        .get(`/api/rides/${r[0].id}/bookings`)
        .set('Cookie', other.cookie)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/rides/missing/bookings')
        .set('Cookie', driver.cookie)
        .expect(404);
    });
  });
});
