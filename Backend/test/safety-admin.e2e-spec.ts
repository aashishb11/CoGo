import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import { rides, safetyIncidents } from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import { signUpAndVerify, signUpAndVerifyAsAdmin } from './helpers/auth';
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

type AdminIncidentListItem = {
  id: string;
  rideId: string;
  reporterId: string;
  category: string;
  note: string | null;
  createdAt: string;
};

type AdminIncidentListResponse = {
  items: AdminIncidentListItem[];
  page: number;
  limit: number;
  total: number;
};

type AdminFlaggedRide = {
  rideId: string;
  tripId: string;
  driverId: string;
  driverName: string;
  scheduledDeparture: string;
  status: string;
  originLabel: string;
  destinationLabel: string;
  incidentCount: number;
  lastIncidentAt: string;
};

type AdminFlaggedRideListResponse = {
  items: AdminFlaggedRide[];
  page: number;
  limit: number;
  total: number;
};

type AdminIncidentDetail = {
  id: string;
  category: string;
  note: string | null;
  createdAt: string;
  ride: {
    id: string;
    scheduledDeparture: string;
    originLabel: string;
    destinationLabel: string;
    tripId: string;
    driverId: string;
    driverName: string;
  };
  reporter: {
    id: string;
    name: string;
    email: string;
    role: 'driver' | 'passenger';
  };
};

type AdminRideReview = {
  ride: {
    id: string;
    tripId: string;
    driverId: string;
    driverName: string;
    scheduledDeparture: string;
    status: string;
    originLabel: string;
    destinationLabel: string;
    startedAt: string | null;
    completedAt: string | null;
    flaggedForReview: boolean;
  };
  incidents: AdminIncidentListItem[];
};

describe('Safety admin (e2e)', () => {
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
    // Same in-suite override as `incidents.e2e-spec.ts` so the post-commit
    // email dispatch never reaches Brevo.
    mailService.sendIncidentAlertEmail = () => Promise.resolve();
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

  const seedAdmin = async () =>
    signUpAndVerifyAsAdmin(app, db, mailService, {
      email: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      password: 'password123',
      name: 'Admin',
    });

  describe('GET /api/admin/incidents', () => {
    it('admin sees every incident newest first; non-admin is denied', async () => {
      const { driver, ride } = await seedInProgressRide();
      const passenger = await newUser('p');
      await makeBooking(db, passenger.userId, ride.id, {
        status: 'accepted',
        boardedAt: new Date(),
      });

      // One incident from the driver, one from the passenger; passenger is
      // newer so should sort first.
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', driver.cookie)
        .send({ category: 'other', note: 'driver-side' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', passenger.cookie)
        .send({ category: 'unsafe_driving' })
        .expect(201);

      const admin = await seedAdmin();
      const res = await request(app.getHttpServer())
        .get('/api/admin/incidents')
        .set('Cookie', admin.cookie)
        .expect(200);
      const body = res.body as AdminIncidentListResponse;
      expect(body.total).toBe(2);
      expect(body.items).toHaveLength(2);
      expect(body.items[0].reporterId).toBe(passenger.userId);
      expect(body.items[1].reporterId).toBe(driver.userId);

      // Non-admin (the driver who reported the incident) is forbidden.
      // Admin guard maps to 401 or 403 depending on the plugin default —
      // accept either, mirroring `ratings.e2e-spec.ts`.
      const denied = await request(app.getHttpServer())
        .get('/api/admin/incidents')
        .set('Cookie', driver.cookie);
      expect([401, 403]).toContain(denied.status);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/incidents')
        .expect(401);
    });
  });

  describe('GET /api/admin/incidents/:id', () => {
    it('returns hydrated detail with ride snapshot and reporter role', async () => {
      const { driver, ride } = await seedInProgressRide();
      const passenger = await newUser('p');
      await makeBooking(db, passenger.userId, ride.id, {
        status: 'accepted',
        boardedAt: new Date(),
      });
      const created = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', passenger.cookie)
        .send({ category: 'harassment', note: 'context' })
        .expect(201);
      const incidentId = (created.body as { id: string }).id;

      const admin = await seedAdmin();
      const res = await request(app.getHttpServer())
        .get(`/api/admin/incidents/${incidentId}`)
        .set('Cookie', admin.cookie)
        .expect(200);
      const body = res.body as AdminIncidentDetail;
      expect(body.id).toBe(incidentId);
      expect(body.category).toBe('harassment');
      expect(body.note).toBe('context');
      expect(body.ride.id).toBe(ride.id);
      expect(body.ride.driverId).toBe(driver.userId);
      expect(body.reporter.id).toBe(passenger.userId);
      expect(body.reporter.role).toBe('passenger');
      expect(body.reporter.email).toContain('@');
    });

    it('driver-reporter resolves role=driver', async () => {
      const { driver, ride } = await seedInProgressRide();
      const created = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', driver.cookie)
        .send({ category: 'other' })
        .expect(201);
      const incidentId = (created.body as { id: string }).id;

      const admin = await seedAdmin();
      const res = await request(app.getHttpServer())
        .get(`/api/admin/incidents/${incidentId}`)
        .set('Cookie', admin.cookie)
        .expect(200);
      expect((res.body as AdminIncidentDetail).reporter.role).toBe('driver');
    });

    it('unknown id → 404', async () => {
      const admin = await seedAdmin();
      await request(app.getHttpServer())
        .get('/api/admin/incidents/does-not-exist')
        .set('Cookie', admin.cookie)
        .expect(404);
    });
  });

  describe('GET /api/admin/rides/flagged', () => {
    it('lists rides flagged for review with incident counts; ordered by most recent incident', async () => {
      // Ride A: 1 incident, older.
      const a = await seedInProgressRide();
      await request(app.getHttpServer())
        .post(`/api/rides/${a.ride.id}/incidents`)
        .set('Cookie', a.driver.cookie)
        .send({ category: 'other' })
        .expect(201);
      // Ride B: 2 incidents, including a newer one — should appear first.
      const b = await seedInProgressRide();
      const passenger = await newUser('p');
      await makeBooking(db, passenger.userId, b.ride.id, {
        status: 'accepted',
        boardedAt: new Date(),
      });
      await request(app.getHttpServer())
        .post(`/api/rides/${b.ride.id}/incidents`)
        .set('Cookie', b.driver.cookie)
        .send({ category: 'other' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/rides/${b.ride.id}/incidents`)
        .set('Cookie', passenger.cookie)
        .send({ category: 'unsafe_driving' })
        .expect(201);

      const admin = await seedAdmin();
      const res = await request(app.getHttpServer())
        .get('/api/admin/rides/flagged')
        .set('Cookie', admin.cookie)
        .expect(200);
      const body = res.body as AdminFlaggedRideListResponse;
      expect(body.total).toBe(2);
      expect(body.items[0].rideId).toBe(b.ride.id);
      expect(body.items[0].incidentCount).toBe(2);
      expect(body.items[1].rideId).toBe(a.ride.id);
      expect(body.items[1].incidentCount).toBe(1);
    });

    it('excludes rides that are not flagged', async () => {
      // Manually create a non-flagged ride with no incident.
      const driver = await seedDriverWithCar('clean');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      await makeRide(db, trip.id, {
        scheduledDeparture: new Date(),
        status: 'active',
      });
      const admin = await seedAdmin();
      const res = await request(app.getHttpServer())
        .get('/api/admin/rides/flagged')
        .set('Cookie', admin.cookie)
        .expect(200);
      expect((res.body as AdminFlaggedRideListResponse).total).toBe(0);
    });
  });

  describe('GET /api/admin/rides/:rideId/review', () => {
    it('returns the ride with every incident, newest first', async () => {
      const { driver, ride } = await seedInProgressRide();
      // Insert incidents directly so we control timestamps.
      await db.insert(safetyIncidents).values([
        {
          id: 'inc_old',
          rideId: ride.id,
          reporterId: driver.userId,
          category: 'other',
          note: 'older',
          createdAt: new Date(Date.now() - minutes(30)),
        },
        {
          id: 'inc_new',
          rideId: ride.id,
          reporterId: driver.userId,
          category: 'unsafe_driving',
          note: 'newer',
          createdAt: new Date(Date.now() - minutes(5)),
        },
      ]);
      await db
        .update(rides)
        .set({ flaggedForReview: true })
        .where(eq(rides.id, ride.id));

      const admin = await seedAdmin();
      const res = await request(app.getHttpServer())
        .get(`/api/admin/rides/${ride.id}/review`)
        .set('Cookie', admin.cookie)
        .expect(200);
      const body = res.body as AdminRideReview;
      expect(body.ride.id).toBe(ride.id);
      expect(body.ride.flaggedForReview).toBe(true);
      expect(body.incidents.map((i) => i.id)).toEqual(['inc_new', 'inc_old']);
    });

    it('unknown ride → 404', async () => {
      const admin = await seedAdmin();
      await request(app.getHttpServer())
        .get('/api/admin/rides/does-not-exist/review')
        .set('Cookie', admin.cookie)
        .expect(404);
    });
  });

  describe('PATCH /api/admin/rides/:rideId/review', () => {
    it('clears flagged_for_review and preserves incidents', async () => {
      const { driver, ride } = await seedInProgressRide();
      await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/incidents`)
        .set('Cookie', driver.cookie)
        .send({ category: 'other' })
        .expect(201);
      // Sanity: incident creation flipped the flag.
      const [before] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, ride.id));
      expect(before.flaggedForReview).toBe(true);

      const admin = await seedAdmin();
      const res = await request(app.getHttpServer())
        .patch(`/api/admin/rides/${ride.id}/review`)
        .set('Cookie', admin.cookie)
        .expect(200);
      expect((res.body as { flaggedForReview: boolean }).flaggedForReview).toBe(
        false,
      );

      const [after] = await db
        .select()
        .from(rides)
        .where(eq(rides.id, ride.id));
      expect(after.flaggedForReview).toBe(false);
      const remainingIncidents = await db
        .select()
        .from(safetyIncidents)
        .where(eq(safetyIncidents.rideId, ride.id));
      expect(remainingIncidents).toHaveLength(1);
    });

    it('idempotent on already-clear ride', async () => {
      const driver = await seedDriverWithCar('clean');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const ride = await makeRide(db, trip.id, {
        scheduledDeparture: new Date(),
        status: 'active',
      });
      const admin = await seedAdmin();
      const res = await request(app.getHttpServer())
        .patch(`/api/admin/rides/${ride.id}/review`)
        .set('Cookie', admin.cookie)
        .expect(200);
      expect((res.body as { flaggedForReview: boolean }).flaggedForReview).toBe(
        false,
      );
    });

    it('unknown ride → 404', async () => {
      const admin = await seedAdmin();
      await request(app.getHttpServer())
        .patch('/api/admin/rides/does-not-exist/review')
        .set('Cookie', admin.cookie)
        .expect(404);
    });

    it('non-admin is denied', async () => {
      const { driver, ride } = await seedInProgressRide();
      const denied = await request(app.getHttpServer())
        .patch(`/api/admin/rides/${ride.id}/review`)
        .set('Cookie', driver.cookie);
      expect([401, 403]).toContain(denied.status);
    });
  });
});
