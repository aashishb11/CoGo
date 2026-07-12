import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { and, eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import { userFavoriteTrips } from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import type { TripListResponseDto } from '@modules/trips/trips/dto/trips-response.dto';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import { makeCar, makeTrip } from './helpers/factories';

describe('Favorites (e2e)', () => {
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

  // ───────────────────────────────────────────────────────────────────────
  // PUT /me/favorites/:tripId
  // ───────────────────────────────────────────────────────────────────────

  describe('PUT /api/me/favorites/:tripId', () => {
    it('favorites a trip and exposes it via GET /me/favorites', async () => {
      const driver = await seedDriverWithCar('d');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const u = await newUser('u');

      await request(app.getHttpServer())
        .put(`/api/me/favorites/${trip.id}`)
        .set('Cookie', u.cookie)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/api/me/favorites')
        .set('Cookie', u.cookie)
        .expect(200);
      const body = res.body as TripListResponseDto;
      expect(body.items.map((i) => i.id)).toEqual([trip.id]);
      expect(body.total).toBe(1);
    });

    it('is idempotent: calling twice yields a single row', async () => {
      const driver = await seedDriverWithCar('d');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const u = await newUser('u');

      await request(app.getHttpServer())
        .put(`/api/me/favorites/${trip.id}`)
        .set('Cookie', u.cookie)
        .expect(204);
      await request(app.getHttpServer())
        .put(`/api/me/favorites/${trip.id}`)
        .set('Cookie', u.cookie)
        .expect(204);

      const rows = await db
        .select()
        .from(userFavoriteTrips)
        .where(
          and(
            eq(userFavoriteTrips.userId, u.userId),
            eq(userFavoriteTrips.tripId, trip.id),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it('returns 404 on unknown trip', async () => {
      const u = await newUser('u');
      await request(app.getHttpServer())
        .put('/api/me/favorites/missing')
        .set('Cookie', u.cookie)
        .expect(404);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .put('/api/me/favorites/anything')
        .expect(401);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // DELETE /me/favorites/:tripId
  // ───────────────────────────────────────────────────────────────────────

  describe('DELETE /api/me/favorites/:tripId', () => {
    it('unfavorites a trip and removes it from GET /me/favorites', async () => {
      const driver = await seedDriverWithCar('d');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const u = await newUser('u');

      await request(app.getHttpServer())
        .put(`/api/me/favorites/${trip.id}`)
        .set('Cookie', u.cookie)
        .expect(204);
      await request(app.getHttpServer())
        .delete(`/api/me/favorites/${trip.id}`)
        .set('Cookie', u.cookie)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/api/me/favorites')
        .set('Cookie', u.cookie)
        .expect(200);
      const body = res.body as TripListResponseDto;
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('is idempotent: calling twice both return 204', async () => {
      const driver = await seedDriverWithCar('d');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const u = await newUser('u');

      await request(app.getHttpServer())
        .delete(`/api/me/favorites/${trip.id}`)
        .set('Cookie', u.cookie)
        .expect(204);
      await request(app.getHttpServer())
        .delete(`/api/me/favorites/${trip.id}`)
        .set('Cookie', u.cookie)
        .expect(204);
    });

    it('returns 204 on unknown trip (idempotent no-op, no FK target needed)', async () => {
      const u = await newUser('u');
      await request(app.getHttpServer())
        .delete('/api/me/favorites/missing')
        .set('Cookie', u.cookie)
        .expect(204);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .delete('/api/me/favorites/anything')
        .expect(401);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // GET /me/favorites
  // ───────────────────────────────────────────────────────────────────────

  describe('GET /api/me/favorites', () => {
    it('hides archived and cancelled trips by default', async () => {
      const driver = await seedDriverWithCar('d');
      const active = await makeTrip(db, driver.userId, {
        carId: driver.car.id,
        status: 'active',
      });
      const archived = await makeTrip(db, driver.userId, {
        carId: driver.car.id,
        status: 'archived',
      });
      const cancelled = await makeTrip(db, driver.userId, {
        carId: driver.car.id,
        status: 'cancelled',
      });
      const u = await newUser('u');

      for (const id of [active.id, archived.id, cancelled.id]) {
        await request(app.getHttpServer())
          .put(`/api/me/favorites/${id}`)
          .set('Cookie', u.cookie)
          .expect(204);
      }

      const res = await request(app.getHttpServer())
        .get('/api/me/favorites')
        .set('Cookie', u.cookie)
        .expect(200);
      const body = res.body as TripListResponseDto;
      expect(body.items.map((i) => i.id)).toEqual([active.id]);
    });

    it("returns only the requesting user's favorites", async () => {
      const driver = await seedDriverWithCar('d');
      const trip = await makeTrip(db, driver.userId, { carId: driver.car.id });
      const me = await newUser('me');
      const other = await newUser('other');

      await request(app.getHttpServer())
        .put(`/api/me/favorites/${trip.id}`)
        .set('Cookie', other.cookie)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/api/me/favorites')
        .set('Cookie', me.cookie)
        .expect(200);
      const body = res.body as TripListResponseDto;
      expect(body.items).toEqual([]);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer()).get('/api/me/favorites').expect(401);
    });
  });
});
