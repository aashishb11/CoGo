import { ConfigService } from '@nestjs/config';
import { expo } from '@better-auth/expo';
import { type Auth as BetterAuth, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, bearer, openAPI } from 'better-auth/plugins';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@core/database/schema';
import type { MailService } from '@integrations/mail/mail.service';
import { OrganizationsService } from '@modules/organizations/organizations.service';

// Mirrors the Expo client's `scheme` in cogo-frontend/app.json and the
// `expoClient({ scheme })` in cogo-frontend/src/features/auth/auth-client.ts.
// All three must agree.
const APP_SCHEME = 'cogo';

export function buildTrustedOrigins(): string[] {
  // Dev origins (Expo Go schemes + the web dev server) are allowed in prod
  // too because devs run their dev environments against the deployed Render
  // backend — there's no separate dev backend yet. Without this, sign-in
  // from Expo Go ("Invalid origin: exp://…") and from `expo start --web`
  // (CORS preflight rejected → "couldn't connect") both fail against prod.
  // The https:// origin is the deployed admin webapp on Render.
  return [
    `${APP_SCHEME}://`,
    'exp://',
    'exp://**',
    'http://localhost:8081',
    'https://cogo-admin.onrender.com',
  ];
}

export function createAuth(
  config: ConfigService,
  mailService: MailService,
  db: PostgresJsDatabase<typeof schema>,
  organizationsService: OrganizationsService,
): BetterAuth {
  return betterAuth({
    baseURL: config.getOrThrow<string>('BETTER_AUTH_URL'),
    logger: { disabled: process.env.NODE_ENV === 'test' },
    database: drizzleAdapter(db, { provider: 'pg' }),
    // Default window is 10s/100req per IP. e2e specs sign up many users
    // back-to-back from the loopback address and trip the limiter, which
    // surfaces as 403/429 on /api/auth/sign-up/email mid-suite.
    rateLimit: { enabled: process.env.NODE_ENV !== 'test' },
    trustedOrigins: buildTrustedOrigins(),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: ({ user, url }) =>
        mailService.sendResetPasswordEmail({
          userId: user.id,
          email: user.email,
          url,
        }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }) =>
        mailService.sendVerificationEmail({
          userId: user.id,
          email: user.email,
          url,
        }),
      afterEmailVerification: async (user) => {
        await organizationsService.linkVerifiedUserToOrganizationByEmail(
          user.id,
          user.email,
        );
      },
    },
    socialProviders: {
      google: {
        clientId: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
        clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      },
    },
    plugins: [openAPI(), admin(), expo(), bearer()],
    advanced: {
      // The web frontend runs on a different origin than the API, so the
      // session cookie has to ride cross-site fetches. SameSite=Lax (better-
      // auth's default) blocks that. Native is unaffected — expoClient stores
      // the cookie in SecureStore and re-attaches it via header, bypassing
      // the browser cookie jar entirely. CSRF protection still applies via
      // better-auth's trustedOrigins origin check on state-changing routes.
      defaultCookieAttributes: {
        sameSite: 'none',
        secure: true,
      },
    },
    // The cast is needed because pnpm hoists zod into a path TypeScript
    // can't portably reference. Plugin-inferred extras (admin's banned/role,
    // etc.) are accessed via untyped `auth.api` so we don't lose anything.
  }) as unknown as BetterAuth;
}

export type Auth = BetterAuth;
