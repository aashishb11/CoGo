import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import { user } from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import type { CreateOrganizationResponseDto } from '@modules/organizations/dto/create-organization-response.dto';
import type { OrganizationDetailDto } from '@modules/organizations/dto/organization-detail.dto';
import type { OrganizationListItemDto } from '@modules/organizations/dto/organization-list-item.dto';
import type { OrganizationMatchResponseDto } from '@modules/organizations/dto/organization-match-response.dto';
import type { MeOrganizationResponseDto } from '@modules/organizations/dto/me-organization-response.dto';
import { OrganizationsService } from '@modules/organizations/organizations.service';
import { signUpAndVerify, signUpAndVerifyAsAdmin } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import { makeOrganization } from './helpers/factories';

describe('Organizations (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let mailService: MailService;
  let organizationsService: OrganizationsService;

  beforeAll(async () => {
    ({ app, db, mailService } = await bootstrapTestApp());
    organizationsService = app.get(OrganizationsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  const newUser = (email: string) =>
    signUpAndVerify(app, mailService, {
      email,
      password: 'password123',
      name: 'Test User',
    });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/organizations/match
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/organizations/match', () => {
    it('returns matched=true with the organization when the domain exists', async () => {
      await makeOrganization(db, {
        name: 'Universitat Politècnica de Catalunya',
        domain: 'estudiantat.upc.edu',
      });

      const res = await request(app.getHttpServer())
        .get('/api/organizations/match')
        .query({ email: 'student@estudiantat.upc.edu' })
        .expect(200);

      const body = res.body as OrganizationMatchResponseDto;
      expect(body.matched).toBe(true);
      expect(body.organization).toMatchObject({
        name: 'Universitat Politècnica de Catalunya',
        domain: 'estudiantat.upc.edu',
      });
    });

    it('normalises email casing before matching', async () => {
      await makeOrganization(db, { domain: 'estudiantat.upc.edu' });

      const res = await request(app.getHttpServer())
        .get('/api/organizations/match')
        .query({ email: 'Student@Estudiantat.UPC.edu' })
        .expect(200);

      const body = res.body as OrganizationMatchResponseDto;
      expect(body.matched).toBe(true);
      expect(body.organization?.domain).toBe('estudiantat.upc.edu');
    });

    it('returns matched=false and a message when no organization matches the domain', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/organizations/match')
        .query({ email: 'user@unknown-domain.com' })
        .expect(200);

      const body = res.body as OrganizationMatchResponseDto;
      expect(body.matched).toBe(false);
      expect(body.organization).toBeNull();
      expect(body.message).toMatch(/no supported organization/i);
    });

    it('returns 400 with INVALID_EMAIL_FORMAT for a malformed email', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/organizations/match')
        .query({ email: 'notanemail' })
        .expect(400);

      expect(res.body).toMatchObject({
        code: 'INVALID_EMAIL_FORMAT',
        statusCode: 400,
      });
    });

    it('is publicly accessible without a session', async () => {
      await request(app.getHttpServer())
        .get('/api/organizations/match')
        .query({ email: 'anyone@example.com' })
        .expect(200);
    });

    it('matches a parent domain when no exact subdomain org exists', async () => {
      await makeOrganization(db, {
        name: 'UPC',
        domain: 'upc.edu',
      });

      const res = await request(app.getHttpServer())
        .get('/api/organizations/match')
        .query({ email: 'student@estudiantat.upc.edu' })
        .expect(200);

      const body = res.body as OrganizationMatchResponseDto;
      expect(body.matched).toBe(true);
      expect(body.organization?.domain).toBe('upc.edu');
    });

    it('prefers the most specific domain when both subdomain and parent domain orgs exist', async () => {
      await makeOrganization(db, { name: 'UPC', domain: 'upc.edu' });
      await makeOrganization(db, {
        name: 'Estudiantat UPC',
        domain: 'estudiantat.upc.edu',
      });

      const res = await request(app.getHttpServer())
        .get('/api/organizations/match')
        .query({ email: 'student@estudiantat.upc.edu' })
        .expect(200);

      const body = res.body as OrganizationMatchResponseDto;
      expect(body.matched).toBe(true);
      expect(body.organization?.domain).toBe('estudiantat.upc.edu');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/organizations
  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /api/organizations', () => {
    const adminUser = {
      email: `admin-${Date.now()}@example.com`,
      password: 'password123',
      name: 'Admin User',
    };
    let adminCookie: string[];

    beforeEach(async () => {
      const result = await signUpAndVerifyAsAdmin(app, db, mailService, {
        ...adminUser,
        email: `admin-${Date.now()}@example.com`,
      });
      adminCookie = result.cookie;
    });

    it('creates an organization and returns it with linkedCount=0 when no users match', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/organizations')
        .set('Cookie', adminCookie)
        .send({ name: 'UPC', domain: 'upc.edu' })
        .expect(201);

      const body = res.body as CreateOrganizationResponseDto;
      expect(body.organization).toMatchObject({
        name: 'UPC',
        domain: 'upc.edu',
      });
      expect(body.organization.id).toBeDefined();
      expect(body.linkedCount).toBe(0);
    });

    it('auto-links existing unlinked users with an exact domain match on creation', async () => {
      const { userId } = await signUpAndVerify(app, mailService, {
        email: `student-${Date.now()}@newuni.edu`,
        password: 'password123',
        name: 'Student',
      });

      const res = await request(app.getHttpServer())
        .post('/api/organizations')
        .set('Cookie', adminCookie)
        .send({ name: 'New Uni', domain: 'newuni.edu' })
        .expect(201);

      const body = res.body as CreateOrganizationResponseDto;
      expect(body.linkedCount).toBe(1);

      const [row] = await db
        .select({ organizationId: user.organizationId })
        .from(user)
        .where(eq(user.id, userId));
      expect(row?.organizationId).toBe(body.organization.id);
    });

    it('auto-links existing unlinked users with a subdomain match on creation', async () => {
      const { userId } = await signUpAndVerify(app, mailService, {
        email: `student-${Date.now()}@sub.campusuni.edu`,
        password: 'password123',
        name: 'Student',
      });

      const res = await request(app.getHttpServer())
        .post('/api/organizations')
        .set('Cookie', adminCookie)
        .send({ name: 'Campus Uni', domain: 'campusuni.edu' })
        .expect(201);

      const body = res.body as CreateOrganizationResponseDto;
      expect(body.linkedCount).toBe(1);

      const [row] = await db
        .select({ organizationId: user.organizationId })
        .from(user)
        .where(eq(user.id, userId));
      expect(row?.organizationId).toBe(body.organization.id);
    });

    it('does not link users already linked to another organization', async () => {
      const existingOrg = await makeOrganization(db, { domain: 'other.edu' });
      const { userId } = await signUpAndVerify(app, mailService, {
        email: `student-${Date.now()}@targetuni.edu`,
        password: 'password123',
        name: 'Student',
      });
      await db
        .update(user)
        .set({ organizationId: existingOrg.id })
        .where(eq(user.id, userId));

      const res = await request(app.getHttpServer())
        .post('/api/organizations')
        .set('Cookie', adminCookie)
        .send({ name: 'Target Uni', domain: 'targetuni.edu' })
        .expect(201);

      expect((res.body as CreateOrganizationResponseDto).linkedCount).toBe(0);

      const [row] = await db
        .select({ organizationId: user.organizationId })
        .from(user)
        .where(eq(user.id, userId));
      expect(row?.organizationId).toBe(existingOrg.id);
    });

    it('returns 409 when the domain is already registered', async () => {
      await makeOrganization(db, { domain: 'taken.edu' });

      const res = await request(app.getHttpServer())
        .post('/api/organizations')
        .set('Cookie', adminCookie)
        .send({ name: 'Another Org', domain: 'taken.edu' })
        .expect(409);

      expect(res.body).toMatchObject({ code: 'ORGANIZATION_DOMAIN_EXISTS' });
    });

    it('returns 400 for an invalid domain', async () => {
      await request(app.getHttpServer())
        .post('/api/organizations')
        .set('Cookie', adminCookie)
        .send({ name: 'Bad Org', domain: 'not a domain' })
        .expect(400);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .post('/api/organizations')
        .send({ name: 'X', domain: 'x.edu' })
        .expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const { cookie } = await signUpAndVerify(app, mailService, {
        email: `regular-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Regular',
      });

      await request(app.getHttpServer())
        .post('/api/organizations')
        .set('Cookie', cookie)
        .send({ name: 'X', domain: 'x.edu' })
        .expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/organizations
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/organizations', () => {
    let adminCookie: string[];

    beforeEach(async () => {
      ({ cookie: adminCookie } = await signUpAndVerifyAsAdmin(
        app,
        db,
        mailService,
        {
          email: `admin-${Date.now()}@example.com`,
          password: 'password123',
          name: 'Admin',
        },
      ));
    });

    it('returns an empty array when no organizations exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/organizations')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns all organizations with their member counts', async () => {
      const orgA = await makeOrganization(db, {
        name: 'Alpha Uni',
        domain: 'alpha.edu',
      });
      const orgB = await makeOrganization(db, {
        name: 'Beta Uni',
        domain: 'beta.edu',
      });

      // Two users linked to orgA, one to orgB
      const { userId: u1 } = await signUpAndVerify(app, mailService, {
        email: `u1-${Date.now()}@alpha.edu`,
        password: 'password123',
        name: 'U1',
      });
      const { userId: u2 } = await signUpAndVerify(app, mailService, {
        email: `u2-${Date.now()}@alpha.edu`,
        password: 'password123',
        name: 'U2',
      });
      const { userId: u3 } = await signUpAndVerify(app, mailService, {
        email: `u3-${Date.now()}@beta.edu`,
        password: 'password123',
        name: 'U3',
      });
      await db
        .update(user)
        .set({ organizationId: orgA.id })
        .where(eq(user.id, u1));
      await db
        .update(user)
        .set({ organizationId: orgA.id })
        .where(eq(user.id, u2));
      await db
        .update(user)
        .set({ organizationId: orgB.id })
        .where(eq(user.id, u3));

      const res = await request(app.getHttpServer())
        .get('/api/organizations')
        .set('Cookie', adminCookie)
        .expect(200);

      const body = res.body as OrganizationListItemDto[];
      expect(body).toHaveLength(2);

      const alpha = body.find((o) => o.domain === 'alpha.edu');
      const beta = body.find((o) => o.domain === 'beta.edu');
      expect(alpha?.memberCount).toBe(2);
      expect(beta?.memberCount).toBe(1);
    });

    it('returns memberCount=0 for an organization with no members', async () => {
      await makeOrganization(db, { domain: 'empty.edu' });

      const res = await request(app.getHttpServer())
        .get('/api/organizations')
        .set('Cookie', adminCookie)
        .expect(200);

      const body = res.body as OrganizationListItemDto[];
      expect(body[0].memberCount).toBe(0);
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer()).get('/api/organizations').expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const { cookie } = await signUpAndVerify(app, mailService, {
        email: `regular-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Regular',
      });
      await request(app.getHttpServer())
        .get('/api/organizations')
        .set('Cookie', cookie)
        .expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/organizations/:id
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/organizations/:id', () => {
    let adminCookie: string[];

    beforeEach(async () => {
      ({ cookie: adminCookie } = await signUpAndVerifyAsAdmin(
        app,
        db,
        mailService,
        {
          email: `admin-${Date.now()}@example.com`,
          password: 'password123',
          name: 'Admin',
        },
      ));
    });

    it('returns the organization with an empty members array when no users are linked', async () => {
      const org = await makeOrganization(db, {
        name: 'Empty Uni',
        domain: 'empty.edu',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/organizations/${org.id}`)
        .set('Cookie', adminCookie)
        .expect(200);

      const body = res.body as OrganizationDetailDto;
      expect(body).toMatchObject({
        id: org.id,
        name: 'Empty Uni',
        domain: 'empty.edu',
      });
      expect(body.members).toEqual([]);
    });

    it('returns the organization with its linked members', async () => {
      const org = await makeOrganization(db, { domain: 'members.edu' });
      const { userId } = await signUpAndVerify(app, mailService, {
        email: `m1-${Date.now()}@members.edu`,
        password: 'password123',
        name: 'Member One',
      });
      await db
        .update(user)
        .set({ organizationId: org.id })
        .where(eq(user.id, userId));

      const res = await request(app.getHttpServer())
        .get(`/api/organizations/${org.id}`)
        .set('Cookie', adminCookie)
        .expect(200);

      const body = res.body as OrganizationDetailDto;
      expect(body.members).toHaveLength(1);
      expect(body.members[0]).toMatchObject({
        id: userId,
        name: 'Member One',
        email: expect.stringContaining('@members.edu') as string,
      });
    });

    it('returns 404 for a non-existent organization', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/organizations/non-existent-id')
        .set('Cookie', adminCookie)
        .expect(404);

      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('returns 401 without a session', async () => {
      const org = await makeOrganization(db, { domain: 'auth.edu' });
      await request(app.getHttpServer())
        .get(`/api/organizations/${org.id}`)
        .expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const org = await makeOrganization(db, { domain: 'forbidden.edu' });
      const { cookie } = await signUpAndVerify(app, mailService, {
        email: `regular-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Regular',
      });
      await request(app.getHttpServer())
        .get(`/api/organizations/${org.id}`)
        .set('Cookie', cookie)
        .expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/organizations/me
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/organizations/me', () => {
    it('returns organization=null when the user is not linked', async () => {
      const { cookie } = await newUser(`unlinked-${Date.now()}@example.com`);

      const res = await request(app.getHttpServer())
        .get('/api/organizations/me')
        .set('Cookie', cookie)
        .expect(200);

      const body = res.body as MeOrganizationResponseDto;
      expect(body.organization).toBeNull();
    });

    it('returns the linked organization after email verification with a matching domain', async () => {
      const org = await makeOrganization(db, {
        name: 'Test University',
        domain: 'test-uni.edu',
      });

      // signUpAndVerify triggers the afterEmailVerification hook which calls
      // linkVerifiedUserToOrganizationByEmail automatically.
      const { cookie } = await newUser(`student-${Date.now()}@test-uni.edu`);

      const res = await request(app.getHttpServer())
        .get('/api/organizations/me')
        .set('Cookie', cookie)
        .expect(200);

      const body = res.body as MeOrganizationResponseDto;
      expect(body.organization).toMatchObject({
        id: org.id,
        name: 'Test University',
        domain: 'test-uni.edu',
      });
    });

    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .get('/api/organizations/me')
        .expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/organizations/:id/members/:userId
  // DELETE /api/organizations/:id/members/:userId
  // ─────────────────────────────────────────────────────────────────────────

  describe('member management endpoints', () => {
    let adminCookie: string[];

    beforeEach(async () => {
      ({ cookie: adminCookie } = await signUpAndVerifyAsAdmin(
        app,
        db,
        mailService,
        {
          email: `admin-${Date.now()}@example.com`,
          password: 'password123',
          name: 'Admin',
        },
      ));
    });

    describe('POST /api/organizations/:id/members/:userId', () => {
      it('links the user to the organization', async () => {
        const org = await makeOrganization(db, { domain: 'addme.edu' });
        const { userId } = await signUpAndVerify(app, mailService, {
          email: `target-${Date.now()}@example.com`,
          password: 'password123',
          name: 'Target',
        });

        await request(app.getHttpServer())
          .post(`/api/organizations/${org.id}/members/${userId}`)
          .set('Cookie', adminCookie)
          .expect(204);

        const [row] = await db
          .select({ organizationId: user.organizationId })
          .from(user)
          .where(eq(user.id, userId));
        expect(row?.organizationId).toBe(org.id);
      });

      it('returns 404 when the organization does not exist', async () => {
        const { userId } = await signUpAndVerify(app, mailService, {
          email: `target2-${Date.now()}@example.com`,
          password: 'password123',
          name: 'Target',
        });
        await request(app.getHttpServer())
          .post(`/api/organizations/non-existent/members/${userId}`)
          .set('Cookie', adminCookie)
          .expect(404);
      });

      it('returns 403 for a non-admin user', async () => {
        const org = await makeOrganization(db, { domain: 'restricted.edu' });
        const { userId, cookie } = await signUpAndVerify(app, mailService, {
          email: `reg-${Date.now()}@example.com`,
          password: 'password123',
          name: 'Reg',
        });
        await request(app.getHttpServer())
          .post(`/api/organizations/${org.id}/members/${userId}`)
          .set('Cookie', cookie)
          .expect(403);
      });
    });

    describe('DELETE /api/organizations/:id/members/:userId', () => {
      it('unlinks the user from the organization', async () => {
        const org = await makeOrganization(db, { domain: 'removeme.edu' });
        const { userId } = await signUpAndVerify(app, mailService, {
          email: `member-${Date.now()}@removeme.edu`,
          password: 'password123',
          name: 'Member',
        });
        await db
          .update(user)
          .set({ organizationId: org.id })
          .where(eq(user.id, userId));

        await request(app.getHttpServer())
          .delete(`/api/organizations/${org.id}/members/${userId}`)
          .set('Cookie', adminCookie)
          .expect(204);

        const [row] = await db
          .select({ organizationId: user.organizationId })
          .from(user)
          .where(eq(user.id, userId));
        expect(row?.organizationId).toBeNull();
      });

      it('returns 404 when the user is not a member of the organization', async () => {
        const org = await makeOrganization(db, { domain: 'notmember.edu' });
        const { userId } = await signUpAndVerify(app, mailService, {
          email: `nomember-${Date.now()}@example.com`,
          password: 'password123',
          name: 'Nobody',
        });
        await request(app.getHttpServer())
          .delete(`/api/organizations/${org.id}/members/${userId}`)
          .set('Cookie', adminCookie)
          .expect(404);
      });

      it('returns 403 for a non-admin user', async () => {
        const org = await makeOrganization(db, { domain: 'cantremove.edu' });
        const { userId, cookie } = await signUpAndVerify(app, mailService, {
          email: `reg2-${Date.now()}@cantremove.edu`,
          password: 'password123',
          name: 'Reg',
        });
        await db
          .update(user)
          .set({ organizationId: org.id })
          .where(eq(user.id, userId));
        await request(app.getHttpServer())
          .delete(`/api/organizations/${org.id}/members/${userId}`)
          .set('Cookie', cookie)
          .expect(403);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OrganizationsService.linkVerifiedUserToOrganizationByEmail
  // ─────────────────────────────────────────────────────────────────────────

  describe('OrganizationsService.linkVerifiedUserToOrganizationByEmail', () => {
    it('links the user when the domain matches an organization', async () => {
      const org = await makeOrganization(db, { domain: 'myuni.edu' });
      const { userId } = await newUser(`person-${Date.now()}@example.com`);

      const result =
        await organizationsService.linkVerifiedUserToOrganizationByEmail(
          userId,
          `person@myuni.edu`,
        );

      expect(result).toEqual({ linked: true });

      const [row] = await db
        .select({ organizationId: user.organizationId })
        .from(user)
        .where(eq(user.id, userId));
      expect(row?.organizationId).toBe(org.id);
    });

    it('returns linked=false with reason=no_org when no organization matches', async () => {
      const { userId } = await newUser(`solo-${Date.now()}@example.com`);

      const result =
        await organizationsService.linkVerifiedUserToOrganizationByEmail(
          userId,
          'solo@unregistered-domain.edu',
        );

      expect(result).toEqual({ linked: false, reason: 'no_org' });
    });

    it('is idempotent: calling twice with the same org returns linked=true both times', async () => {
      const org = await makeOrganization(db, { domain: 'repeated.edu' });
      const { userId } = await newUser(`rep-${Date.now()}@example.com`);

      await organizationsService.linkVerifiedUserToOrganizationByEmail(
        userId,
        `rep@repeated.edu`,
      );
      const result =
        await organizationsService.linkVerifiedUserToOrganizationByEmail(
          userId,
          `rep@repeated.edu`,
        );

      expect(result).toEqual({ linked: true });

      const [row] = await db
        .select({ organizationId: user.organizationId })
        .from(user)
        .where(eq(user.id, userId));
      expect(row?.organizationId).toBe(org.id);
    });

    it('does not overwrite an existing different organization (hook path: throwOnConflict=false)', async () => {
      const orgA = await makeOrganization(db, { domain: 'org-a.edu' });
      const orgB = await makeOrganization(db, { domain: 'org-b.edu' });
      const { userId } = await newUser(`conflict-${Date.now()}@example.com`);

      // Link to orgA first
      await organizationsService.linkVerifiedUserToOrganizationByEmail(
        userId,
        `conflict@org-a.edu`,
      );

      // Attempting to link to orgB in hook mode (default: no throw)
      const result =
        await organizationsService.linkVerifiedUserToOrganizationByEmail(
          userId,
          `conflict@org-b.edu`,
        );

      expect(result).toEqual({ linked: false, reason: 'conflict' });

      // orgA link must remain intact
      const [row] = await db
        .select({ organizationId: user.organizationId })
        .from(user)
        .where(eq(user.id, userId));
      expect(row?.organizationId).toBe(orgA.id);

      // Sanity: orgB was not silently written
      expect(row?.organizationId).not.toBe(orgB.id);
    });

    it('throws ORGANIZATION_DOMAIN_CONFLICT when throwOnConflict=true and user is already linked to a different org', async () => {
      await makeOrganization(db, { domain: 'first.edu' });
      await makeOrganization(db, { domain: 'second.edu' });
      const { userId } = await newUser(`throw-${Date.now()}@example.com`);

      await organizationsService.linkVerifiedUserToOrganizationByEmail(
        userId,
        `throw@first.edu`,
      );

      await expect(
        organizationsService.linkVerifiedUserToOrganizationByEmail(
          userId,
          `throw@second.edu`,
          { throwOnConflict: true },
        ),
      ).rejects.toMatchObject({
        response: { code: 'ORGANIZATION_DOMAIN_CONFLICT' },
      });
    });

    it('throws INVALID_EMAIL_FORMAT for a malformed email', async () => {
      const { userId } = await newUser(`bad-${Date.now()}@example.com`);
      await expect(
        organizationsService.linkVerifiedUserToOrganizationByEmail(
          userId,
          'not-an-email',
        ),
      ).rejects.toMatchObject({ response: { code: 'INVALID_EMAIL_FORMAT' } });
    });

    it('links via parent domain when no exact subdomain org exists', async () => {
      const org = await makeOrganization(db, { domain: 'upc.edu' });
      const { userId } = await newUser(`sub-${Date.now()}@example.com`);

      const result =
        await organizationsService.linkVerifiedUserToOrganizationByEmail(
          userId,
          'student@estudiantat.upc.edu',
        );

      expect(result).toEqual({ linked: true });

      const [row] = await db
        .select({ organizationId: user.organizationId })
        .from(user)
        .where(eq(user.id, userId));
      expect(row?.organizationId).toBe(org.id);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Profile responses surface organization
  // ─────────────────────────────────────────────────────────────────────────

  describe('profile responses include organization', () => {
    it('GET /me/profile returns organization=null when the caller is not linked', async () => {
      const { cookie } = await newUser(`solo-${Date.now()}@example.com`);

      await request(app.getHttpServer())
        .post('/api/me/profile')
        .set('Cookie', cookie)
        .send({ username: `solo-${Date.now()}` })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/me/profile')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toMatchObject({ organization: null });
    });

    it('GET /me/profile returns the linked organization on the response', async () => {
      const org = await makeOrganization(db, {
        name: 'UPC',
        domain: 'profile-me.edu',
      });
      const { cookie } = await signUpAndVerify(app, mailService, {
        email: `me-${Date.now()}@profile-me.edu`,
        password: 'password123',
        name: 'Linked',
      });

      await request(app.getHttpServer())
        .post('/api/me/profile')
        .set('Cookie', cookie)
        .send({ username: `linked-${Date.now()}` })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/me/profile')
        .set('Cookie', cookie)
        .expect(200);

      const body = res.body as { organization: { id: string; name: string } };
      expect(body.organization).toEqual({ id: org.id, name: 'UPC' });
    });

    it('GET /users/:userId/profile (public) returns organization=null when target is not linked', async () => {
      const { userId, cookie } = await newUser(
        `pub-solo-${Date.now()}@example.com`,
      );
      await request(app.getHttpServer())
        .post('/api/me/profile')
        .set('Cookie', cookie)
        .send({ username: `pubsolo-${Date.now()}` })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/users/${userId}/profile`)
        .expect(200);

      expect(res.body).toMatchObject({ organization: null });
    });

    it('GET /users/:userId/profile (public) returns the linked organization for ride-card trust signals', async () => {
      const org = await makeOrganization(db, {
        name: 'UPC',
        domain: 'profile-pub.edu',
      });
      const { userId, cookie } = await signUpAndVerify(app, mailService, {
        email: `driver-${Date.now()}@profile-pub.edu`,
        password: 'password123',
        name: 'Driver',
      });
      await request(app.getHttpServer())
        .post('/api/me/profile')
        .set('Cookie', cookie)
        .send({ username: `driver-${Date.now()}` })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/users/${userId}/profile`)
        .expect(200);

      const body = res.body as { organization: { id: string; name: string } };
      expect(body.organization).toEqual({ id: org.id, name: 'UPC' });
    });
  });
});
