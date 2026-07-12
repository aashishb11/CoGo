import { Controller, Get, Inject } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';

// Health check endpoint for monitoring API availability and database connectivity
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  @Get()
  @AllowAnonymous()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => {
        await this.db.execute(sql`SELECT 1`);
        return { database: { status: 'up' as const } };
      },
    ]);
  }
}
