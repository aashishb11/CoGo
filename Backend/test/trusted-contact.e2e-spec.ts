import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import { trustedContacts } from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import { makeCar, makeRide, makeTrip } from './helpers/factories';

const ORIGIN = { label: 'Mataró', lat: 41.5381, lng: 2.4445 };
const DESTINATION = { label: 'Barcelona', lat: 41.3851, lng: 2.1734 };

type TrustedContactResponse = {
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

const futureDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

describe('Trusted contact (e2e)', () => {
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

  // ── GET /me/trusted-contact ────────────────────────────────────────────

  describe('GET /api/me/trusted-contact', () => {
    it('returns 404 when no contact is set', async () => {
      const u = await newUser('a');
      await request(app.getHttpServer())
        .get('/api/me/trusted-contact')
        .set('Cookie', u.cookie)
        .expect(404);
    });

    it('returns the contact once it has been set', async () => {
      const u = await newUser('a');

      await request(app.getHttpServer())
        .put('/api/me/trusted-contact')
        .set('Cookie', u.cookie)
        .send({ name: 'Marta García', email: 'marta@example.com' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/me/trusted-contact')
        .set('Cookie', u.cookie)
        .expect(200);

      const body = res.body as TrustedContactResponse;
      expect(body.name).toBe('Marta García');
      expect(body.email).toBe('marta@example.com');
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/me/trusted-contact')
        .expect(401);
    });
  });

  // ── PUT /me/trusted-contact ────────────────────────────────────────────

  describe('PUT /api/me/trusted-contact', () => {
    it('creates the contact row and returns 200 with the saved values', async () => {
      const u = await newUser('a');

      const res = await request(app.getHttpServer())
        .put('/api/me/trusted-contact')
        .set('Cookie', u.cookie)
        .send({ name: 'Marta García', email: 'marta@example.com' })
        .expect(200);

      const body = res.body as TrustedContactResponse;
      expect(body.name).toBe('Marta García');
      expect(body.email).toBe('marta@example.com');

      const [row] = await db
        .select()
        .from(trustedContacts)
        .where(eq(trustedContacts.userId, u.userId));
      expect(row).toBeDefined();
      expect(row.name).toBe('Marta García');
    });

    it('overwrites the existing contact (never clears)', async () => {
      const u = await newUser('a');

      await request(app.getHttpServer())
        .put('/api/me/trusted-contact')
        .set('Cookie', u.cookie)
        .send({ name: 'First', email: 'first@example.com' })
        .expect(200);

      await request(app.getHttpServer())
        .put('/api/me/trusted-contact')
        .set('Cookie', u.cookie)
        .send({ name: 'Second', email: 'second@example.com' })
        .expect(200);

      const rows = await db
        .select()
        .from(trustedContacts)
        .where(eq(trustedContacts.userId, u.userId));
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Second');
      expect(rows[0].email).toBe('second@example.com');
    });

    it('rejects an empty name or an invalid email', async () => {
      const u = await newUser('a');

      await request(app.getHttpServer())
        .put('/api/me/trusted-contact')
        .set('Cookie', u.cookie)
        .send({ name: '', email: 'marta@example.com' })
        .expect(400);

      await request(app.getHttpServer())
        .put('/api/me/trusted-contact')
        .set('Cookie', u.cookie)
        .send({ name: 'Marta', email: 'not-an-email' })
        .expect(400);
    });
  });

  // ── Trusted-contact gate on booking and trip publish ───────────────────

  describe('TRUSTED_CONTACT_REQUIRED precondition', () => {
    const createTripBody = (carId: string) => ({
      carId,
      type: 'sporadic',
      origin: ORIGIN,
      destination: DESTINATION,
      musicAllowed: false,
      seatsOffered: 3,
      pricePerSeatCents: 500,
      departureAt: futureDate(7).toISOString(),
    });

    it('blocks POST /api/trips with TRUSTED_CONTACT_REQUIRED until a contact is set', async () => {
      const driver = await newUser('d');
      const car = await makeCar(db, driver.userId);

      const blocked = await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', driver.cookie)
        .send(createTripBody(car.id))
        .expect(403);

      expect(blocked.body).toMatchObject({
        code: 'TRUSTED_CONTACT_REQUIRED',
        statusCode: 403,
      });

      await request(app.getHttpServer())
        .put('/api/me/trusted-contact')
        .set('Cookie', driver.cookie)
        .send({ name: 'Marta', email: 'marta@example.com' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/trips')
        .set('Cookie', driver.cookie)
        .send(createTripBody(car.id))
        .expect(201);
    });

    it('blocks POST /api/trips/:id/bookings with TRUSTED_CONTACT_REQUIRED until a contact is set', async () => {
      const driver = await newUser('d');
      const passenger = await newUser('p');

      // Seed the driver's trusted contact + trip via DB so the test
      // exercises only the passenger gate.
      const car = await makeCar(db, driver.userId);
      await db.insert(trustedContacts).values({
        userId: driver.userId,
        name: 'Driver Contact',
        email: 'dc@example.com',
      });
      const trip = await makeTrip(db, driver.userId, { carId: car.id });
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: futureDate(2),
      });

      const blocked = await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', passenger.cookie)
        .send({ rideIds: [ride.id] })
        .expect(403);

      expect(blocked.body).toMatchObject({
        code: 'TRUSTED_CONTACT_REQUIRED',
        statusCode: 403,
      });

      await request(app.getHttpServer())
        .put('/api/me/trusted-contact')
        .set('Cookie', passenger.cookie)
        .send({ name: 'PaxContact', email: 'paxc@example.com' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/trips/${trip.id}/bookings`)
        .set('Cookie', passenger.cookie)
        .send({ rideIds: [ride.id] })
        .expect(201);
    });
  });
});
