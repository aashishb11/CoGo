import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import { pushSubscriptions } from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import type { PushSubscriptionResponseDto } from '@modules/notifications/dto/push-subscription-response.dto';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';

describe('Push subscriptions (e2e)', () => {
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

  const validBody = (overrides: Record<string, unknown> = {}) => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${Math.random().toString(36).slice(2, 12)}`,
    keys: { p256dh: 'BL4ID-fake-public-key', auth: 'aN4mTlW-fake-auth' },
    ...overrides,
  });

  // ── POST ────────────────────────────────────────────────────────────────

  describe('POST /api/me/push-subscriptions', () => {
    it('creates a subscription and returns the row (default settings)', async () => {
      const u = await newUser('a');
      const body = validBody();

      const res = await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', u.cookie)
        .send(body)
        .expect(201);

      const row = res.body as PushSubscriptionResponseDto;
      expect(row.id).toEqual(expect.any(String));
      expect(row.endpoint).toBe(body.endpoint);
      expect(row.settings).toEqual({ traffic_alerts: true });
      expect(new Date(row.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('honors initial settings when provided', async () => {
      const u = await newUser('a');

      const res = await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', u.cookie)
        .send(validBody({ settings: { traffic_alerts: false } }))
        .expect(201);

      const row = res.body as PushSubscriptionResponseDto;
      expect(row.settings).toEqual({ traffic_alerts: false });
    });

    it('upserts on the same endpoint: refreshes keys/settings, keeps the row', async () => {
      const u = await newUser('a');
      const endpoint = `https://fcm.googleapis.com/fcm/send/abcdef`;

      const first = await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', u.cookie)
        .send(validBody({ endpoint }))
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', u.cookie)
        .send(
          validBody({
            endpoint,
            keys: { p256dh: 'rotated', auth: 'rotated' },
            settings: { traffic_alerts: false },
          }),
        )
        .expect(201);

      expect((second.body as PushSubscriptionResponseDto).id).toBe(
        (first.body as PushSubscriptionResponseDto).id,
      );
      expect((second.body as PushSubscriptionResponseDto).settings).toEqual({
        traffic_alerts: false,
      });

      const rows = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
      expect(rows).toHaveLength(1);
      expect(rows[0].keys).toEqual({ p256dh: 'rotated', auth: 'rotated' });
    });

    it('rebinds an existing endpoint to a different user (shared device)', async () => {
      const a = await newUser('a');
      const b = await newUser('b');
      const endpoint = `https://fcm.googleapis.com/fcm/send/shared`;

      const first = await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', a.cookie)
        .send(validBody({ endpoint }))
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', b.cookie)
        .send(validBody({ endpoint }))
        .expect(201);

      // a no longer sees the row.
      const aList = await request(app.getHttpServer())
        .get('/api/me/push-subscriptions')
        .set('Cookie', a.cookie)
        .expect(200);
      expect(aList.body).toEqual([]);

      // b sees it, with the same id (rebinding doesn't reissue).
      const bList = await request(app.getHttpServer())
        .get('/api/me/push-subscriptions')
        .set('Cookie', b.cookie)
        .expect(200);
      expect(
        (bList.body as PushSubscriptionResponseDto[]).map((r) => r.id),
      ).toEqual([(first.body as PushSubscriptionResponseDto).id]);
    });

    it('rejects a non-https endpoint', async () => {
      const u = await newUser('a');
      await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', u.cookie)
        .send(validBody({ endpoint: 'http://insecure.example.com/x' }))
        .expect(400);
    });

    it('rejects a malformed body (missing keys)', async () => {
      const u = await newUser('a');
      const body = validBody();
      delete (body as Record<string, unknown>).keys;
      await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', u.cookie)
        .send(body)
        .expect(400);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .send(validBody())
        .expect(401);
    });
  });

  // ── GET ─────────────────────────────────────────────────────────────────

  describe('GET /api/me/push-subscriptions', () => {
    it("returns only the requesting user's subscriptions", async () => {
      const a = await newUser('a');
      const b = await newUser('b');

      await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', a.cookie)
        .send(validBody())
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', a.cookie)
        .send(validBody())
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', b.cookie)
        .send(validBody())
        .expect(201);

      const aRes = await request(app.getHttpServer())
        .get('/api/me/push-subscriptions')
        .set('Cookie', a.cookie)
        .expect(200);
      expect((aRes.body as PushSubscriptionResponseDto[]).length).toBe(2);

      const bRes = await request(app.getHttpServer())
        .get('/api/me/push-subscriptions')
        .set('Cookie', b.cookie)
        .expect(200);
      expect((bRes.body as PushSubscriptionResponseDto[]).length).toBe(1);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .get('/api/me/push-subscriptions')
        .expect(401);
    });
  });

  // ── PATCH ───────────────────────────────────────────────────────────────

  describe('PATCH /api/me/push-subscriptions/:id', () => {
    it('updates settings and bumps updatedAt', async () => {
      const u = await newUser('a');
      const created = await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', u.cookie)
        .send(validBody())
        .expect(201);

      const before = created.body as PushSubscriptionResponseDto;

      const res = await request(app.getHttpServer())
        .patch(`/api/me/push-subscriptions/${before.id}`)
        .set('Cookie', u.cookie)
        .send({ settings: { traffic_alerts: false } })
        .expect(200);

      const after = res.body as PushSubscriptionResponseDto;
      expect(after.settings).toEqual({ traffic_alerts: false });
      expect(new Date(after.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(before.updatedAt).getTime(),
      );
    });

    it('returns 404 when the subscription belongs to a different user', async () => {
      const a = await newUser('a');
      const b = await newUser('b');
      const created = await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', a.cookie)
        .send(validBody())
        .expect(201);

      await request(app.getHttpServer())
        .patch(
          `/api/me/push-subscriptions/${(created.body as PushSubscriptionResponseDto).id}`,
        )
        .set('Cookie', b.cookie)
        .send({ settings: { traffic_alerts: false } })
        .expect(404);
    });

    it('returns 404 on an unknown id', async () => {
      const u = await newUser('a');
      await request(app.getHttpServer())
        .patch('/api/me/push-subscriptions/missing-id')
        .set('Cookie', u.cookie)
        .send({ settings: { traffic_alerts: false } })
        .expect(404);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .patch('/api/me/push-subscriptions/any')
        .send({ settings: { traffic_alerts: false } })
        .expect(401);
    });
  });

  // ── DELETE ──────────────────────────────────────────────────────────────

  describe('DELETE /api/me/push-subscriptions/:id', () => {
    it('removes the subscription (204) and the row is gone', async () => {
      const u = await newUser('a');
      const created = await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', u.cookie)
        .send(validBody())
        .expect(201);

      const id = (created.body as PushSubscriptionResponseDto).id;
      await request(app.getHttpServer())
        .delete(`/api/me/push-subscriptions/${id}`)
        .set('Cookie', u.cookie)
        .expect(204);

      const rows = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.id, id));
      expect(rows).toEqual([]);
    });

    it('returns 404 when the subscription belongs to a different user', async () => {
      const a = await newUser('a');
      const b = await newUser('b');
      const created = await request(app.getHttpServer())
        .post('/api/me/push-subscriptions')
        .set('Cookie', a.cookie)
        .send(validBody())
        .expect(201);

      await request(app.getHttpServer())
        .delete(
          `/api/me/push-subscriptions/${(created.body as PushSubscriptionResponseDto).id}`,
        )
        .set('Cookie', b.cookie)
        .expect(404);
    });

    it('returns 404 on an unknown id', async () => {
      const u = await newUser('a');
      await request(app.getHttpServer())
        .delete('/api/me/push-subscriptions/missing-id')
        .set('Cookie', u.cookie)
        .expect(404);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .delete('/api/me/push-subscriptions/any')
        .expect(401);
    });
  });
});
