import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DbClient } from '@core/database/database.module';
import type { MailService } from '@integrations/mail/mail.service';
import type {
  PartnerRideDto,
  PartnerRideSearchResponseDto,
} from '@modules/partner/dto/partner-ride.dto';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import { makeCar, makeRide, makeTrip } from './helpers/factories';

// Must match PARTNER_API_KEY in test/global-setup.js.
const API_KEY = 'test-partner-api-key';

const ORIGIN_LAT = 41.5381;
const ORIGIN_LNG = 2.4445;
const DEST_LAT = 41.3851;
const DEST_LNG = 2.1734;
// 2026-04-15T22:30 UTC === 2026-04-16T00:30 Madrid (CEST, UTC+2).
const MADRID_DATE = '2026-04-16';
const RIDE_INSTANT = new Date('2026-04-15T22:30:00.000Z');

const SEARCH_QUERY = {
  originLat: ORIGIN_LAT,
  originLng: ORIGIN_LNG,
  destinationLat: DEST_LAT,
  destinationLng: DEST_LNG,
  date: MADRID_DATE,
  radiusKm: 5,
};

describe('Partner API (e2e)', () => {
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

  // Seeds one ACTIVE ride matching SEARCH_QUERY, with 2 free seats.
  const seedActiveRide = async () => {
    const { userId } = await signUpAndVerify(app, mailService, {
      email: `partner-driver-${Date.now()}@example.com`,
      password: 'password123',
      name: 'Partner Driver',
    });
    const car = await makeCar(db, userId);
    const trip = await makeTrip(db, userId, { carId: car.id, seatsOffered: 3 });
    const ride = await makeRide(db, trip.id, {
      scheduledDeparture: RIDE_INSTANT,
      seatsOffered: 3,
      seatsOccupied: 1,
    });
    return { trip, ride };
  };

  describe('authentication', () => {
    it('rejects a request with no API key (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/partner/v1/rides')
        .query(SEARCH_QUERY)
        .expect(401);
    });

    it('rejects a request with a wrong API key (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/partner/v1/rides')
        .query(SEARCH_QUERY)
        .set('Authorization', 'Bearer wrong-key')
        .expect(401);
    });
  });

  describe('GET /api/partner/v1/rides', () => {
    it('returns matching ACTIVE rides in the public shape', async () => {
      const { ride } = await seedActiveRide();

      const res = await request(app.getHttpServer())
        .get('/api/partner/v1/rides')
        .query(SEARCH_QUERY)
        .set('Authorization', `Bearer ${API_KEY}`)
        .expect(200);

      const body = res.body as PartnerRideSearchResponseDto;
      expect(body.total).toBe(1);
      expect(body.items).toHaveLength(1);

      const [item] = body.items;
      expect(item.id).toBe(ride.id);
      expect(item.availableSeats).toBe(2);
      expect(item.driverName).toBe('Partner Driver');
      // Internal-only fields must not leak.
      expect(item).not.toHaveProperty('tripId');
      expect(item).not.toHaveProperty('seatsOffered');
    });
  });

  describe('GET /api/partner/v1/rides/:rideId', () => {
    it('returns a single ride by id', async () => {
      const { ride } = await seedActiveRide();

      const res = await request(app.getHttpServer())
        .get(`/api/partner/v1/rides/${ride.id}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .expect(200);

      const body = res.body as PartnerRideDto;
      expect(body.id).toBe(ride.id);
      expect(body.availableSeats).toBe(2);
    });

    it('returns 404 for an unknown ride id', async () => {
      await request(app.getHttpServer())
        .get('/api/partner/v1/rides/does-not-exist')
        .set('Authorization', `Bearer ${API_KEY}`)
        .expect(404);
    });

    it('rejects an unauthenticated detail request (401)', async () => {
      const { ride } = await seedActiveRide();

      await request(app.getHttpServer())
        .get(`/api/partner/v1/rides/${ride.id}`)
        .expect(401);
    });
  });
});
