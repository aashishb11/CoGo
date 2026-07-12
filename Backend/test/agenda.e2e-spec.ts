import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { type DbClient } from '@core/database/database.module';
import type { MailService } from '@integrations/mail/mail.service';
import type {
  AgendaDriverItemDto,
  AgendaPassengerItemDto,
  AgendaResponseDto,
} from '@modules/trips/agenda/dto/agenda-response.dto';
import type { AgendaFeedResponseDto } from '@modules/trips/agenda/dto/agenda-feed-response.dto';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import {
  makeBooking,
  makeCar,
  makeCarModel,
  makeRide,
  makeTrip,
} from './helpers/factories';

const futureDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

const pastDate = (daysBehind: number) =>
  new Date(Date.now() - daysBehind * 24 * 60 * 60 * 1000);

describe('Agenda (e2e)', () => {
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

  const seedTripWithRide = async (
    driverId: string,
    carId: string,
    rideOpts: Partial<Parameters<typeof makeRide>[2]> = {},
  ) => {
    const trip = await makeTrip(db, driverId, { carId, seatsOffered: 3 });
    const ride = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(1),
      seatsOffered: 3,
      seatsOccupied: 0,
      ...rideOpts,
    });
    return { trip, ride };
  };

  const isDriver = (
    item: AgendaDriverItemDto | AgendaPassengerItemDto,
  ): item is AgendaDriverItemDto => item.role === 'driver';

  const isPassenger = (
    item: AgendaDriverItemDto | AgendaPassengerItemDto,
  ): item is AgendaPassengerItemDto => item.role === 'passenger';

  // ───────────────────────────────────────────────────────────────────────

  it('default window returns rides where the user is the driver', async () => {
    const driver = await seedDriverWithCar('d');
    const { ride } = await seedTripWithRide(driver.userId, driver.car.id);

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', driver.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    expect(body.items).toHaveLength(1);
    const [item] = body.items;
    expect(item.role).toBe('driver');
    expect(item.rideId).toBe(ride.id);
  });

  it('default window returns rides where the user has an ACCEPTED booking', async () => {
    const driver = await seedDriverWithCar('d');
    const { ride } = await seedTripWithRide(driver.userId, driver.car.id);
    const passenger = await newUser('p');
    const booking = await makeBooking(db, passenger.userId, ride.id, {
      status: 'accepted',
    });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', passenger.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    expect(body.items).toHaveLength(1);
    const [item] = body.items;
    expect(item.role).toBe('passenger');
    expect(item.rideId).toBe(ride.id);
    if (isPassenger(item)) {
      expect(item.myBookingId).toBe(booking.id);
      expect(item.myBookingStatus).toBe('accepted');
    }
  });

  it('default scope returns rides with PENDING bookings as well', async () => {
    const driver = await seedDriverWithCar('d');
    const { ride } = await seedTripWithRide(driver.userId, driver.car.id);
    const passenger = await newUser('p');
    const booking = await makeBooking(db, passenger.userId, ride.id, {
      status: 'pending',
    });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', passenger.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    expect(body.items).toHaveLength(1);
    const [item] = body.items;
    if (isPassenger(item)) {
      expect(item.myBookingId).toBe(booking.id);
      expect(item.myBookingStatus).toBe('pending');
    } else {
      throw new Error('expected passenger role');
    }
  });

  it('?bookingStatus=accepted filters out PENDING bookings', async () => {
    const driver = await seedDriverWithCar('d');
    const { trip } = await seedTripWithRide(driver.userId, driver.car.id);
    const r1 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(1),
    });
    const r2 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(2),
    });
    const passenger = await newUser('p');
    await makeBooking(db, passenger.userId, r1.id, { status: 'accepted' });
    await makeBooking(db, passenger.userId, r2.id, { status: 'pending' });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda?bookingStatus=accepted')
      .set('Cookie', passenger.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].rideId).toBe(r1.id);
  });

  it('?bookingStatus=pending filters to PENDING only', async () => {
    const driver = await seedDriverWithCar('d');
    const { trip } = await seedTripWithRide(driver.userId, driver.car.id);
    const r1 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(1),
    });
    const r2 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(2),
    });
    const passenger = await newUser('p');
    await makeBooking(db, passenger.userId, r1.id, { status: 'accepted' });
    await makeBooking(db, passenger.userId, r2.id, { status: 'pending' });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda?bookingStatus=pending')
      .set('Cookie', passenger.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].rideId).toBe(r2.id);
  });

  it('?bookingStatus=accepted,pending matches default behaviour', async () => {
    const driver = await seedDriverWithCar('d');
    const { trip } = await seedTripWithRide(driver.userId, driver.car.id);
    const r1 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(1),
    });
    const r2 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(2),
    });
    const passenger = await newUser('p');
    await makeBooking(db, passenger.userId, r1.id, { status: 'accepted' });
    await makeBooking(db, passenger.userId, r2.id, { status: 'pending' });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda?bookingStatus=accepted,pending')
      .set('Cookie', passenger.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    expect(body.items.map((i) => i.rideId).sort()).toEqual(
      [r1.id, r2.id].sort(),
    );
  });

  it('?bookingStatus=cancelled returns 400', async () => {
    const passenger = await newUser('p');
    await request(app.getHttpServer())
      .get('/api/me/agenda?bookingStatus=cancelled')
      .set('Cookie', passenger.cookie)
      .expect(400);
  });

  it('driver rows are unaffected by ?bookingStatus', async () => {
    const driver = await seedDriverWithCar('d');
    const { ride } = await seedTripWithRide(driver.userId, driver.car.id);

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda?bookingStatus=accepted')
      .set('Cookie', driver.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].role).toBe('driver');
    expect(body.items[0].rideId).toBe(ride.id);
  });

  it('CANCELLED, REJECTED and EXPIRED bookings do not appear', async () => {
    const driver = await seedDriverWithCar('d');
    const { trip } = await seedTripWithRide(driver.userId, driver.car.id);
    const r1 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(2),
    });
    const r2 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(3),
    });
    const r3 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(4),
    });
    const passenger = await newUser('p');
    await makeBooking(db, passenger.userId, r1.id, { status: 'cancelled' });
    await makeBooking(db, passenger.userId, r2.id, { status: 'rejected' });
    await makeBooking(db, passenger.userId, r3.id, { status: 'expired' });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', passenger.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    expect(body.items).toEqual([]);
  });

  it('driver row carries pendingBookingCount', async () => {
    const driver = await seedDriverWithCar('d');
    const { ride } = await seedTripWithRide(driver.userId, driver.car.id);
    const p1 = await newUser('p1');
    const p2 = await newUser('p2');
    const p3 = await newUser('p3');
    await makeBooking(db, p1.userId, ride.id, { status: 'pending' });
    await makeBooking(db, p2.userId, ride.id, { status: 'pending' });
    await makeBooking(db, p3.userId, ride.id, { status: 'accepted' });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', driver.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    const [item] = body.items;
    if (isDriver(item)) {
      expect(item.pendingBookingCount).toBe(2);
    } else {
      throw new Error('expected driver role');
    }
  });

  it('driver row carries seatsOccupied and seatsOffered', async () => {
    const driver = await seedDriverWithCar('d');
    const { ride } = await seedTripWithRide(driver.userId, driver.car.id, {
      seatsOffered: 4,
      seatsOccupied: 2,
    });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', driver.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    const [item] = body.items;
    if (isDriver(item)) {
      expect(item.seatsOffered).toBe(4);
      expect(item.seatsOccupied).toBe(2);
      expect(item.rideId).toBe(ride.id);
    } else {
      throw new Error('expected driver role');
    }
  });

  it('items are sorted by scheduledDeparture ascending across roles', async () => {
    const driver = await seedDriverWithCar('d');
    const otherDriver = await seedDriverWithCar('d2');
    // The first user is driver of one trip with two rides at days 5 and 1.
    const myTrip = await makeTrip(db, driver.userId, {
      carId: driver.car.id,
    });
    const myRideLater = await makeRide(db, myTrip.id, {
      scheduledDeparture: futureDate(5),
    });
    const myRideEarlier = await makeRide(db, myTrip.id, {
      scheduledDeparture: futureDate(1),
    });
    // …and passenger on someone else's ride at day 3.
    const otherTrip = await makeTrip(db, otherDriver.userId, {
      carId: otherDriver.car.id,
    });
    const passengerRide = await makeRide(db, otherTrip.id, {
      scheduledDeparture: futureDate(3),
    });
    await makeBooking(db, driver.userId, passengerRide.id, {
      status: 'accepted',
    });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', driver.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    expect(body.items.map((i) => i.rideId)).toEqual([
      myRideEarlier.id,
      passengerRide.id,
      myRideLater.id,
    ]);
  });

  it('respects ?from and ?to bounds', async () => {
    const driver = await seedDriverWithCar('d');
    const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
    const r1 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(1),
    });
    const r2 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(5),
    });
    const r3 = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(10),
    });

    const from = futureDate(3).toISOString();
    const to = futureDate(7).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/api/me/agenda?from=${from}&to=${to}`)
      .set('Cookie', driver.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    expect(body.items.map((i) => i.rideId)).toEqual([r2.id]);
    // Sanity: r1 and r3 are out of window.
    expect(body.items.map((i) => i.rideId)).not.toContain(r1.id);
    expect(body.items.map((i) => i.rideId)).not.toContain(r3.id);
  });

  it('CANCELLED rides are excluded', async () => {
    const driver = await seedDriverWithCar('d');
    const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
    await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(1),
      status: 'cancelled',
    });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', driver.cookie)
      .expect(200);

    expect((res.body as AgendaResponseDto).items).toEqual([]);
  });

  it('COMPLETED rides are included with status="completed"', async () => {
    // Completed rides belong on the agenda so a `from` in the past or the
    // .ics calendar feed surfaces recent history; cancelled rides remain
    // excluded (see the test above).
    const driver = await seedDriverWithCar('d');
    const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
    const ride = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(1),
      status: 'completed',
    });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', driver.cookie)
      .expect(200);

    const items = (res.body as AgendaResponseDto).items;
    expect(items).toHaveLength(1);
    expect(items[0].rideId).toBe(ride.id);
    expect(items[0].status).toBe('completed');
  });

  it('returns 401 without a session', async () => {
    await request(app.getHttpServer()).get('/api/me/agenda').expect(401);
  });

  it('does not duplicate rides where the user is driver of one and passenger on another at overlapping departure', async () => {
    const me = await seedDriverWithCar('me');
    const otherDriver = await seedDriverWithCar('o');

    // My trip A — I am driver.
    const tripA = await makeTrip(db, me.userId, { carId: me.car.id });
    const rideA = await makeRide(db, tripA.id, {
      scheduledDeparture: futureDate(2),
    });

    // Trip B by other driver — I am passenger via ACCEPTED booking, departing the same day.
    const tripB = await makeTrip(db, otherDriver.userId, {
      carId: otherDriver.car.id,
    });
    const rideB = await makeRide(db, tripB.id, {
      scheduledDeparture: futureDate(2),
    });
    await makeBooking(db, me.userId, rideB.id, { status: 'accepted' });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', me.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    const ids = body.items.map((i) => i.rideId);
    expect(new Set(ids)).toEqual(new Set([rideA.id, rideB.id]));
    expect(ids).toHaveLength(2);

    const a = body.items.find((i) => i.rideId === rideA.id)!;
    const b = body.items.find((i) => i.rideId === rideB.id)!;
    expect(a.role).toBe('driver');
    expect(b.role).toBe('passenger');
  });

  it('past rides outside the default window are not returned', async () => {
    const driver = await seedDriverWithCar('d');
    const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
    await makeRide(db, trip.id, {
      scheduledDeparture: pastDate(2),
    });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', driver.cookie)
      .expect(200);

    expect((res.body as AgendaResponseDto).items).toEqual([]);
  });

  it('passenger row exposes driver { id, name, avatar } from the trip driver', async () => {
    const driver = await seedDriverWithCar('drv');
    const { ride } = await seedTripWithRide(driver.userId, driver.car.id);
    const passenger = await newUser('pp');
    await makeBooking(db, passenger.userId, ride.id, { status: 'accepted' });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', passenger.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    const [item] = body.items;
    if (isPassenger(item)) {
      expect(item.driver.id).toBe(driver.userId);
      expect(item.driver.name).toMatch(/^User drv/);
      expect(item.driver.avatar).toBeNull();
    } else {
      throw new Error('expected passenger role');
    }
  });

  it('passenger row exposes car { brand, model, color, plate } from the trip car', async () => {
    const driver = await newUser('drv');
    const model = await makeCarModel(db, {
      brand: 'Seat',
      name: 'Ibiza',
      co2KgPerKm: 0.13,
    });
    const car = await makeCar(db, driver.userId, {
      modelId: model.id,
      plate: 'ABC-9999',
      color: 'red',
    });
    const trip = await makeTrip(db, driver.userId, { carId: car.id });
    const ride = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(1),
    });
    const passenger = await newUser('pp');
    await makeBooking(db, passenger.userId, ride.id, { status: 'accepted' });

    const res = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', passenger.cookie)
      .expect(200);

    const body = res.body as AgendaResponseDto;
    const [item] = body.items;
    if (isPassenger(item)) {
      expect(item.car).toEqual({
        brand: 'Seat',
        model: 'Ibiza',
        color: 'red',
        plate: 'ABC-9999',
      });
    } else {
      throw new Error('expected passenger role');
    }
  });

  it('both row types include tripType, estimatedDurationMinutes and estimatedCo2SavingsPerSeatKg', async () => {
    const driver = await newUser('drv');
    const model = await makeCarModel(db, { co2KgPerKm: 0.12 });
    const car = await makeCar(db, driver.userId, { modelId: model.id });
    const trip = await makeTrip(db, driver.userId, {
      carId: car.id,
      totalDistanceKm: 34.52,
      estimatedDurationMinutes: 28,
    });
    const driverRide = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(1),
      totalDistanceKm: 34.52,
    });

    const passenger = await newUser('pp');
    const passengerRide = await makeRide(db, trip.id, {
      scheduledDeparture: futureDate(2),
      totalDistanceKm: 34.52,
    });
    await makeBooking(db, passenger.userId, passengerRide.id, {
      status: 'accepted',
    });

    const driverRes = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', driver.cookie)
      .expect(200);
    const driverBody = driverRes.body as AgendaResponseDto;
    const driverItem = driverBody.items.find((i) => i.rideId === driverRide.id);
    expect(driverItem).toBeDefined();
    expect(driverItem!.tripType).toBe('sporadic');
    expect(driverItem!.estimatedDurationMinutes).toBe(28);
    // 34.52 × 0.12 = 4.1424 → 4.14 (matches trips' detail response)
    expect(driverItem!.estimatedCo2SavingsPerSeatKg).toBe(4.14);

    const passengerRes = await request(app.getHttpServer())
      .get('/api/me/agenda')
      .set('Cookie', passenger.cookie)
      .expect(200);
    const passengerBody = passengerRes.body as AgendaResponseDto;
    const passengerItem = passengerBody.items.find(
      (i) => i.rideId === passengerRide.id,
    );
    expect(passengerItem).toBeDefined();
    expect(passengerItem!.tripType).toBe('sporadic');
    expect(passengerItem!.estimatedDurationMinutes).toBe(28);
    expect(passengerItem!.estimatedCo2SavingsPerSeatKg).toBe(4.14);
  });

  // ──── ICS feed ─────────────────────────────────────────────────────────

  const tokenOf = (url: string) => new URL(url).searchParams.get('token') ?? '';

  it('GET /me/agenda/feed mints a token and returns a stable URL', async () => {
    const driver = await seedDriverWithCar('d');

    const first = await request(app.getHttpServer())
      .get('/api/me/agenda/feed')
      .set('Cookie', driver.cookie)
      .expect(200);
    const firstUrl = (first.body as AgendaFeedResponseDto).url;
    expect(firstUrl).toContain('/api/me/agenda.ics?token=');

    const second = await request(app.getHttpServer())
      .get('/api/me/agenda/feed')
      .set('Cookie', driver.cookie)
      .expect(200);
    expect((second.body as AgendaFeedResponseDto).url).toBe(firstUrl);
  });

  it('GET /me/agenda/feed requires a session', async () => {
    await request(app.getHttpServer()).get('/api/me/agenda/feed').expect(401);
  });

  it('POST /me/agenda/feed/rotate changes the token and revokes the old URL', async () => {
    const driver = await seedDriverWithCar('d');

    const before = await request(app.getHttpServer())
      .get('/api/me/agenda/feed')
      .set('Cookie', driver.cookie)
      .expect(200);
    const oldToken = tokenOf((before.body as AgendaFeedResponseDto).url);

    const rotated = await request(app.getHttpServer())
      .post('/api/me/agenda/feed/rotate')
      .set('Cookie', driver.cookie)
      .expect(201);
    const newToken = tokenOf((rotated.body as AgendaFeedResponseDto).url);
    expect(newToken).not.toBe(oldToken);

    await request(app.getHttpServer())
      .get(`/api/me/agenda.ics?token=${oldToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/me/agenda.ics?token=${newToken}`)
      .expect(200);
  });

  it('GET /me/agenda.ics is anonymous and returns the user rides as text/calendar', async () => {
    const driver = await seedDriverWithCar('d');
    const { ride } = await seedTripWithRide(driver.userId, driver.car.id);

    const feed = await request(app.getHttpServer())
      .get('/api/me/agenda/feed')
      .set('Cookie', driver.cookie)
      .expect(200);
    const token = tokenOf((feed.body as AgendaFeedResponseDto).url);

    const ics = await request(app.getHttpServer())
      .get(`/api/me/agenda.ics?token=${token}`)
      .expect(200);

    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('BEGIN:VCALENDAR');
    expect(ics.text).toContain(`UID:ride-${ride.id}@cogo.app`);
  });

  it('GET /me/agenda.ics includes recently-past rides within the feed window', async () => {
    const driver = await seedDriverWithCar('d');
    const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
    const recentPast = await makeRide(db, trip.id, {
      scheduledDeparture: pastDate(3),
    });

    const feed = await request(app.getHttpServer())
      .get('/api/me/agenda/feed')
      .set('Cookie', driver.cookie)
      .expect(200);
    const token = tokenOf((feed.body as AgendaFeedResponseDto).url);

    const ics = await request(app.getHttpServer())
      .get(`/api/me/agenda.ics?token=${token}`)
      .expect(200);
    expect(ics.text).toContain(`UID:ride-${recentPast.id}@cogo.app`);
  });

  it('GET /me/agenda.ics returns 401 for a missing or unknown token', async () => {
    await request(app.getHttpServer()).get('/api/me/agenda.ics').expect(401);
    await request(app.getHttpServer())
      .get('/api/me/agenda.ics?token=not-a-real-token')
      .expect(401);
  });
});
