import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { envValidationSchema } from '@core/config/env.validation';
import { DatabaseModule } from '@core/database/database.module';
import { AuthModule } from '@modules/auth/auth.module';
import { CultucatModule } from '@modules/cultucat/cultucat.module';
import { DevModule } from '@modules/dev/dev.module';
import { FleetModule } from '@modules/fleet/fleet.module';
import { HealthModule } from '@modules/health/health.module';
import { LeaderboardModule } from '@modules/leaderboard/leaderboard.module';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { PartnerModule } from '@modules/partner/partner.module';
import { RatingsModule } from '@modules/ratings/ratings.module';
import { SafetyModule } from '@modules/safety/safety.module';
import { TripsModule } from '@modules/trips/trips.module';
import { UsersModule } from '@modules/users/users.module';
import { WalletModule } from '@modules/wallet/wallet.module';
import { GlobalExceptionFilter } from '@shared/errors/global-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.getOrThrow<string>('LOG_LEVEL'),
          // Pretty in every environment because we read logs via Render's
          // dashboard, not a log aggregator. Switch to undefined (raw JSON)
          // if logs ever get shipped to Datadog/Loki/Elastic.
          transport: { target: 'pino-pretty', options: { singleLine: true } },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          serializers: {
            req: (req: {
              id: number;
              method: string;
              url: string;
              headers: Record<string, string | undefined>;
            }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
              userAgent: req.headers['user-agent'],
              ip:
                req.headers['cf-connecting-ip'] ??
                req.headers['x-forwarded-for'],
            }),
            res: (res: { statusCode: number }) => ({
              statusCode: res.statusCode,
            }),
          },
          autoLogging: {
            ignore: (req: { url?: string }) =>
              req.url === '/api/auth/get-session',
          },
        },
      }),
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    CultucatModule,
    DevModule,
    HealthModule,
    OrganizationsModule,
    TripsModule,
    UsersModule,
    FleetModule,
    LeaderboardModule,
    PartnerModule,
    RatingsModule,
    SafetyModule,
    WalletModule,
  ],
  controllers: [],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class AppModule {}
