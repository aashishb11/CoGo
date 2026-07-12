import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import express from 'express';
import postgres from 'postgres';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { DB, type DbClient } from '@core/database/database.module';
import { MailService } from '@integrations/mail/mail.service';
import { RoutingService } from '@integrations/routing/routing.service';

export type TestApp = {
  app: INestApplication<App>;
  db: DbClient;
  mailService: MailService;
};

export type ProviderOverride = {
  provide: unknown;
  useValue: unknown;
};

let migrationsApplied = false;

export async function bootstrapTestApp(options?: {
  providerOverrides?: ProviderOverride[];
}): Promise<TestApp> {
  if (!migrationsApplied) {
    const client = postgres(process.env.DATABASE_URL!, {
      max: 1,
      onnotice: () => {},
    });
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    await client.end();
    migrationsApplied = true;
  }

  // Stub RoutingService so trip creation doesn't reach the public OSRM demo
  // server (`router.project-osrm.org`). The real call is rate-limited and
  // can hang past Jest's per-test timeout, which is the second-largest
  // source of e2e flakiness after the cron schedule.
  const routingStub: Pick<RoutingService, 'getRoute'> = {
    getRoute: () =>
      Promise.resolve({ distanceKm: 30, durationMinutes: 30, polyline: null }),
  };

  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(RoutingService)
    .useValue(routingStub);

  for (const override of options?.providerOverrides ?? []) {
    moduleBuilder
      .overrideProvider(override.provide)
      .useValue(override.useValue);
  }

  const moduleFixture = await moduleBuilder.compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');

  // Mirrors the raw-body mount in src/main.ts so webhook e2e tests can
  // POST signed Stripe fixtures without Nest's JSON parser eating the
  // body before signature verification runs.
  app.use('/api/webhooks/stripe', express.raw({ type: '*/*' }));
  app.use('/api/webhooks/stripe/connect', express.raw({ type: '*/*' }));

  app.enableShutdownHooks();
  await app.init();

  // Stop wall-clock cron jobs so they don't fire during tests and mutate state
  // mid-assertion (e.g. BookingsExpiryService.sweep flipping seeded rows before
  // a test's own manual sweep runs). Tests still invoke cron methods directly
  // via `app.get(Service)` — only the schedule is silenced.
  const scheduler = app.get(SchedulerRegistry);
  for (const job of scheduler.getCronJobs().values()) void job.stop();

  return {
    app,
    db: app.get<DbClient>(DB),
    mailService: app.get(MailService),
  };
}
