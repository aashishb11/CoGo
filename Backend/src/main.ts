import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildTrustedOrigins } from '@modules/auth/auth.factory';
import { setupDocs } from './docs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import express from 'express';
import { join } from 'node:path';
import postgres from 'postgres';

async function bootstrap() {
  const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 });
  await migrate(drizzle(migrationClient), { migrationsFolder: './drizzle' });
  await migrationClient.end();

  // bodyParser: false is required by @thallesp/nestjs-better-auth so the
  // package can re-apply parsing for non-auth routes only — better-auth's
  // toNodeHandler reads the raw stream for /api/auth/*.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  const config = app.get(ConfigService);

  // Serves `public/` at `/static/*`. Used to host the logo PNG referenced
  // from transactional emails (see MailService.brand → MAIL_LOGO_URL). Works
  // from both `pnpm start:dev` and the built bundle because the deployed
  // process's cwd is the repo root in both cases.
  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/static/' });

  app.enableCors({
    origin: buildTrustedOrigins(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  // Stripe webhooks require the original byte stream so signature
  // verification can recompute the HMAC. better-auth's adapter
  // re-applies JSON parsing for non-auth routes, so we mount
  // `express.raw()` on the two webhook paths before Nest reaches them.
  app.use('/api/webhooks/stripe', express.raw({ type: '*/*' }));
  app.use('/api/webhooks/stripe/connect', express.raw({ type: '*/*' }));

  app.enableShutdownHooks();

  await setupDocs(app);

  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap();
