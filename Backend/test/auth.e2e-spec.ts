import type { Session, User } from 'better-auth';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { type DbClient } from '@core/database/database.module';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let lastVerificationUrl: string;

  beforeAll(async () => {
    const bootstrapped = await bootstrapTestApp();
    app = bootstrapped.app;
    db = bootstrapped.db;

    // Intercept outgoing emails and capture the verification URL instead of
    // actually calling the Gmail SMTP.
    bootstrapped.mailService.sendVerificationEmail = ({ url }) => {
      lastVerificationUrl = url;
      return Promise.resolve();
    };
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    lastVerificationUrl = '';
    await truncateAll(db);
  });

  const TEST_USER = {
    email: 'test@example.com',
    password: 'password123',
    name: 'Test User',
  };

  const signUp = (data = TEST_USER) =>
    request(app.getHttpServer()).post('/api/auth/sign-up/email').send(data);

  const signIn = (
    credentials = { email: TEST_USER.email, password: TEST_USER.password },
  ) =>
    request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send(credentials);

  // Signs up and immediately verifies the email using the captured URL so
  // subsequent sign-in calls succeed.
  const signUpAndVerify = async (data = TEST_USER) => {
    await signUp(data);
    const url = new URL(lastVerificationUrl);
    // Strip callbackURL so Better Auth returns JSON instead of a redirect.
    url.searchParams.delete('callbackURL');
    await request(app.getHttpServer()).get(url.pathname + url.search);
  };

  describe('POST /api/auth/sign-up/email', () => {
    it('creates a user and returns their data', async () => {
      const res = await signUp().expect(200);
      const body = res.body as { user: User };

      expect(body.user.email).toBe(TEST_USER.email);
      expect(body.user.name).toBe(TEST_USER.name);
    });

    it('sends a verification email on sign-up', async () => {
      await signUp();
      expect(lastVerificationUrl).toMatch(/\/api\/auth\/verify-email\?token=/);
    });

    it('returns 200 (not 422) when the email is already registered to prevent email enumeration', async () => {
      await signUp();
      // Better Auth returns 200 with requireEmailVerification enabled so that
      // an attacker cannot determine whether an email address is already registered.
      await signUp().expect(200);
    });
  });

  describe('POST /api/auth/sign-in/email', () => {
    it('returns 403 when email is not yet verified', async () => {
      await signUp();
      await signIn().expect(403);
    });

    describe('with a verified email', () => {
      beforeEach(async () => {
        await signUpAndVerify();
      });

      it('returns a session cookie on valid credentials', async () => {
        const res = await signIn().expect(200);
        const body = res.body as { user: User };

        expect(res.headers['set-cookie']).toBeDefined();
        expect(body.user.email).toBe(TEST_USER.email);
      });

      it('returns 401 on invalid password', async () => {
        await signIn({
          email: TEST_USER.email,
          password: 'wrongpassword',
        }).expect(401);
      });
    });
  });

  describe('GET /api/auth/get-session', () => {
    it('returns null without a session cookie', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/get-session')
        .expect(200);

      expect(res.body).toBeNull();
    });

    it('returns the user and session with a valid cookie', async () => {
      await signUpAndVerify();
      const signInRes = await signIn();
      const cookie = signInRes.headers['set-cookie'] as unknown as string[];

      const res = await request(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Cookie', cookie)
        .expect(200);

      const body = res.body as { user: User; session: Session };

      expect(body.user.email).toBe(TEST_USER.email);
      expect(body.session).toBeDefined();
    });
  });

  describe('POST /api/auth/sign-out', () => {
    it('invalidates the session', async () => {
      await signUpAndVerify();
      const signInRes = await signIn();
      const cookie = signInRes.headers['set-cookie'] as unknown as string[];

      await request(app.getHttpServer())
        .post('/api/auth/sign-out')
        .set('Cookie', cookie)
        .expect(200);

      const sessionRes = await request(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Cookie', cookie)
        .expect(200);

      expect(sessionRes.body).toBeNull();
    });
  });

  describe('POST /api/auth/sign-in/social (Google OAuth)', () => {
    it('returns a Google OAuth URL when initiating the flow', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-in/social')
        .send({ provider: 'google', callbackURL: 'http://localhost:3000' })
        .expect(200);

      const body = res.body as { url: string; redirect: boolean };

      expect(body.redirect).toBe(true);
      expect(body.url).toMatch(/accounts\.google\.com/);
    });
  });

  describe('Protected routes', () => {
    it('returns 401 without a session', async () => {
      await request(app.getHttpServer()).get('/api/users/me').expect(401);
    });

    it('returns 200 with a valid session', async () => {
      await signUpAndVerify();
      const signInRes = await signIn();
      const cookie = signInRes.headers['set-cookie'] as unknown as string[];

      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Cookie', cookie)
        .expect(200);
    });
  });
});
