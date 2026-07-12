import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import * as schema from '@core/database/schema';
import { bookings, rides, trips } from '@core/database/schema';
import { NotificationsService } from '@modules/notifications/notifications.service';

const DEFAULT_DELAY_MINUTES = 11;

interface TrafficAlertBody {
  rideId?: string;
  delayMinutes?: number;
}

interface TrafficAlertResponse {
  ok: true;
  rideId: string;
  recipientCount: number;
}

// Demo-only trigger for the congestion-alert push. Gated by DEMO_MODE so the
// route is a 403 in normal prod and an active endpoint only during the demo
// window (see docs/plans/demo-implementation-plan.md §7).
@Controller('dev')
@AllowAnonymous()
export class DevController {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post('traffic-alert')
  @HttpCode(HttpStatus.OK)
  async trafficAlert(
    @Body() body: TrafficAlertBody,
  ): Promise<TrafficAlertResponse> {
    if (process.env.DEMO_MODE !== 'true') {
      throw new ForbiddenException('Dev endpoints disabled');
    }

    const delayMinutes = body.delayMinutes ?? DEFAULT_DELAY_MINUTES;

    const ride = body.rideId
      ? await this.findRideById(body.rideId)
      : await this.findSoonestRideWithAcceptedBooking();

    if (!ride) {
      throw new NotFoundException(
        body.rideId
          ? `Ride ${body.rideId} not found`
          : 'No demo-ready ride found (need an active ride with at least one accepted booking)',
      );
    }

    const acceptedPassengers = await this.db
      .select({ passengerId: bookings.passengerId })
      .from(bookings)
      .where(
        and(eq(bookings.rideId, ride.id), eq(bookings.status, 'accepted')),
      );

    const userIds = [
      ride.driverId,
      ...acceptedPassengers.map((b) => b.passengerId),
    ];

    await this.notificationsService.sendTrafficAlert(userIds, {
      rideId: ride.id,
      delayMinutes,
      scheduledDeparture: ride.scheduledDeparture,
    });

    return {
      ok: true,
      rideId: ride.id,
      recipientCount: userIds.length,
    };
  }

  private async findRideById(rideId: string): Promise<{
    id: string;
    driverId: string;
    scheduledDeparture: Date;
  } | null> {
    const [row] = await this.db
      .select({
        id: rides.id,
        driverId: trips.driverId,
        scheduledDeparture: rides.scheduledDeparture,
      })
      .from(rides)
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .where(eq(rides.id, rideId))
      .limit(1);
    return row ?? null;
  }

  private async findSoonestRideWithAcceptedBooking(): Promise<{
    id: string;
    driverId: string;
    scheduledDeparture: Date;
  } | null> {
    // INNER JOIN to bookings filtered by status='accepted' enforces the
    // "at least one accepted passenger" requirement. Multiple accepted
    // bookings on the same ride yield duplicate rows, but `limit(1)` after
    // `orderBy(scheduledDeparture)` picks the soonest match deterministically.
    const [row] = await this.db
      .select({
        id: rides.id,
        driverId: trips.driverId,
        scheduledDeparture: rides.scheduledDeparture,
      })
      .from(rides)
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .innerJoin(
        bookings,
        and(eq(bookings.rideId, rides.id), eq(bookings.status, 'accepted')),
      )
      .where(
        and(
          eq(rides.status, 'active'),
          gt(rides.scheduledDeparture, sql`now()`),
        ),
      )
      .orderBy(asc(rides.scheduledDeparture))
      .limit(1);
    return row ?? null;
  }
}
