import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import { user } from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';

/**
 * pre: `mailService` was resolved from the same `app` (the patch is
 *      per-app-instance — each Test module builds its own DI container).
 */
export async function signUpAndVerify(
  app: INestApplication<App>,
  mailService: MailService,
  user: { email: string; password: string; name: string },
): Promise<{ cookie: string[]; userId: string }> {
  let verificationUrl = '';
  mailService.sendVerificationEmail = ({ url }) => {
    verificationUrl = url;
    return Promise.resolve();
  };

  await request(app.getHttpServer())
    .post('/api/auth/sign-up/email')
    .send(user)
    .expect(200);

  const verify = new URL(verificationUrl);
  // Strip callbackURL so Better Auth returns JSON instead of a redirect.
  verify.searchParams.delete('callbackURL');
  await request(app.getHttpServer()).get(verify.pathname + verify.search);

  const signIn = await request(app.getHttpServer())
    .post('/api/auth/sign-in/email')
    .send({ email: user.email, password: user.password })
    .expect(200);

  const cookie = signIn.headers['set-cookie'] as unknown as string[];
  const body = signIn.body as { user: { id: string } };
  return { cookie, userId: body.user.id };
}

export async function signUpAndVerifyAsAdmin(
  app: INestApplication<App>,
  db: DbClient,
  mailService: MailService,
  userInfo: { email: string; password: string; name: string },
): Promise<{ cookie: string[]; userId: string }> {
  const { userId } = await signUpAndVerify(app, mailService, userInfo);
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, userId));

  const signIn = await request(app.getHttpServer())
    .post('/api/auth/sign-in/email')
    .send({ email: userInfo.email, password: userInfo.password })
    .expect(200);

  const cookie = signIn.headers['set-cookie'] as unknown as string[];
  return { cookie, userId };
}
