import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import { rides, safetyIncidents } from '@core/database/schema';
import type {
  IncidentAlertPayload,
  MailService,
} from '@integrations/mail/mail.service';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import {
  makeBooking,
  makeCar,
  makeProfile,
  makeRide,
  makeTrip,
  makeTrustedContact,
} from './helpers/factories';

type IncidentResponse = {
  id: string;
  rideId: string;
  category: string;
  note: string | null;
  createdAt: string;
};

type IncidentListResponse = {
  items: IncidentResponse[];
  page: number;
  limit: number;
  total: number;
};

const minutes = (m: number) => m * 60 * 1000;
const hours = (h: number) => h * 60 * 60 * 1000;

describe('Safety incidents (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let mailService: MailService;
  let sentEmails: IncidentAlertPayload[];

  beforeAll(async () => {
    ({ app, db, mailService } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
    sentEmails = [];
    // Capture incident emails without touching Brevo. signUpAndVerify
    // overrides `sendVerificationEmail` separately on each user; the
    // incident method is untouched by that helper, so this override is
    // safe across the suite.
    mailService.sendIncidentAlertEmail = (payload) => {
      sentEmails.push(payload);
      return Promise.resolve();
    };
  });

  const newUser = async (suffix: string) => {
    const u = await signUpAndVerify(app, mailService, {
      email: `${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: 'password123',
      name: `User ${suffix}`,
    });
    await makeTrustedContact(db, u.userId, {
      name: `${suffix} contact`,
      email: `${suffix}-contact-${Date.now()}@example.com`,
    });
    return u;
  };

  const seedDriverWithCar = async (suffix = 'driver') => {
    const u = await newUser(suffix);
    const car = await makeCar(db, u.userId);
    return { ...u, car };
  };

  const seedInProgressRide = async () => {
    const driver = await seedDriverWithCar('d');
    const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
    const ride = await makeRide(db, trip.id, {
      scheduledDeparture: new Date(Date.now() - minutes(15)),
      status: 'in_progress',
      startedAt: new Date(Date.now() - minutes(10)),
    });
    return { driver, trip, ride };
  };

  describe('POST /api/rides/:rideId/incidents', () => {
    it('boarded passenger reports → 201, ride flagged, email captured', async () => {
      const { driver, ride } = await seedInProgressRide();
      const passenger = await newUser('p');
      await makeBooking(db, passenger.userId, ride.id, {
        status: 'accepted',
        boardedAt: new Date(Date.now() - minutes(5)),
      });

      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', passenger.cookie)
        .send({ category: 'unsafe_driving', note: 'speeding' })
        .expect(201);

      const body = res.body as IncidentResponse;
      expect(body.category).toBe('unsafe_driving');
      expect(body.note).toBe('speeding');

      const [row] = await db.select().from(rides).where(eq(rides.id, ride.id));
      expect(row.flaggedForReview).toBe(true);

      expect(sentEmails).toHaveLength(1);
      const email = sentEmails[0];
      expect(email.reporterRole).toBe('passenger');
      expect(email.ride.driverName).toBe(driver.cookie ? 'User d' : 'User d');
      expect(email.acceptedPassengers).toHaveLength(0);
    });

    it('driver reports → 201 + email body lists every accepted passenger with name + phone', async () => {
      const { driver, ride } = await seedInProgressRide();
      const p1 = await newUser('p1');
      const p2 = await newUser('p2');
      await makeProfile(db, p1.userId, { phone: '+34 600 111 111' });
      await makeProfile(db, p2.userId, { phone: '+34 600 222 222' });
      await makeBooking(db, p1.userId, ride.id, {
        status: 'accepted',
        boardedAt: new Date(),
      });
      await makeBooking(db, p2.userId, ride.id, {
        status: 'accepted',
        boardedAt: new Date(),
      });

      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', driver.cookie)
        .send({ category: 'accident' })
        .expect(201);

      expect(sentEmails).toHaveLength(1);
      const email = sentEmails[0];
      expect(email.reporterRole).toBe('driver');
      const passengerIds = email.acceptedPassengers.map((p) => p.userId).sort();
      expect(passengerIds).toEqual([p1.userId, p2.userId].sort());
      const phones = email.acceptedPassengers.map((p) => p.phone).sort();
      expect(phones).toEqual(['+34 600 111 111', '+34 600 222 222']);
    });

    it('non-boarded passenger (accepted but boarded_at null) is rejected with 403', async () => {
      const { ride } = await seedInProgressRide();
      const passenger = await newUser('p');
      await makeBooking(db, passenger.userId, ride.id, {
        status: 'accepted',
        boardedAt: null,
      });

      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', passenger.cookie)
        .send({ category: 'other' })
        .expect(403);

      expect(sentEmails).toHaveLength(0);
    });

    it('random user with no booking on the ride is rejected with 403', async () => {
      const { ride } = await seedInProgressRide();
      const intruder = await newUser('x');

      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', intruder.cookie)
        .send({ category: 'other' })
        .expect(403);
    });

    it('report 25h after completion rejected with INCIDENT_WINDOW_CLOSED', async () => {
      const { driver, ride } = await seedInProgressRide();
      await db
        .update(rides)
        .set({
          status: 'completed',
          completedAt: new Date(Date.now() - hours(25)),
        })
        .where(eq(rides.id, ride.id));

      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', driver.cookie)
        .send({ category: 'other' })
        .expect(400);

      expect((res.body as { code: string }).code).toBe(
        'INCIDENT_WINDOW_CLOSED',
      );
    });

    it('report within 24h of completion is allowed', async () => {
      const { driver, ride } = await seedInProgressRide();
      await db
        .update(rides)
        .set({
          status: 'completed',
          completedAt: new Date(Date.now() - hours(12)),
        })
        .where(eq(rides.id, ride.id));

      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', driver.cookie)
        .send({ category: 'harassment' })
        .expect(201);
    });

    it('requires authentication', async () => {
      const { ride } = await seedInProgressRide();
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .send({ category: 'other' })
        .expect(401);
    });

    it('rejects unknown category with 400 VALIDATION_FAILED', async () => {
      const { driver, ride } = await seedInProgressRide();
      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', driver.cookie)
        .send({ category: 'not-real' })
        .expect(400);
      expect((res.body as { code: string }).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/me/incidents', () => {
    it('lists incidents I reported, newest first, with pagination', async () => {
      const { driver, ride } = await seedInProgressRide();
      // Three incidents from the same driver on the same ride.
      for (let i = 0; i < 3; i += 1) {
        await db.insert(safetyIncidents).values({
          id: `inc_${i}`,
          rideId: ride.id,
          reporterId: driver.userId,
          category: 'other',
          note: `n${i}`,
          createdAt: new Date(Date.now() - minutes((3 - i) * 5)),
        });
      }
      // A second user's incident must NOT surface in the driver's list.
      const other = await newUser('other');
      await makeBooking(db, other.userId, ride.id, {
        status: 'accepted',
        boardedAt: new Date(),
      });
      await db.insert(safetyIncidents).values({
        id: 'inc_other',
        rideId: ride.id,
        reporterId: other.userId,
        category: 'other',
        note: null,
      });

      const res = await request(app.getHttpServer())
        .get('/api/me/incidents?page=1&limit=2')
        .set('Cookie', driver.cookie)
        .expect(200);
      const body = res.body as IncidentListResponse;
      expect(body.total).toBe(3);
      expect(body.items).toHaveLength(2);
      // Newest first.
      expect(body.items[0].id).toBe('inc_2');
      expect(body.items[1].id).toBe('inc_1');

      const page2 = await request(app.getHttpServer())
        .get('/api/me/incidents?page=2&limit=2')
        .set('Cookie', driver.cookie)
        .expect(200);
      const page2Body = page2.body as IncidentListResponse;
      expect(page2Body.items).toHaveLength(1);
      expect(page2Body.items[0].id).toBe('inc_0');
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/me/incidents').expect(401);
    });
  });
});
