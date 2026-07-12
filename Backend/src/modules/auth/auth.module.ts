import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { MailModule } from '@integrations/mail/mail.module';
import { MailService } from '@integrations/mail/mail.service';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { OrganizationsService } from '@modules/organizations/organizations.service';
import { createAuth } from './auth.factory';

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      imports: [MailModule, OrganizationsModule],
      inject: [ConfigService, MailService, DB, OrganizationsService],
      useFactory: (
        config: ConfigService,
        mailService: MailService,
        db: PostgresJsDatabase<typeof schema>,
        organizationsService: OrganizationsService,
      ) => ({
        auth: createAuth(config, mailService, db, organizationsService),
        // CORS is set with `app.enableCors` in main.ts so we can include PATCH
        // (the package's built-in CORS hardcodes GET/POST/PUT/DELETE only).
        disableTrustedOriginsCors: true,
      }),
    }),
  ],
})
export class AuthModule {}
