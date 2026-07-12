import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB, type DbClient } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import type { Trip } from '@core/database/schema/trips.schema';
import { CultucatService } from '@modules/cultucat/cultucat.service';
import type { InsertRide } from '@core/database/schema/rides.schema';
import { RoutingService } from '@integrations/routing/routing.service';
import { TrustedContactService } from '@modules/safety/trusted-contact.service';
import { CULTUCAT_PROVIDER } from '@shared/external-events/external-event.types';
import { DEFAULT_CULTUCAT_EVENT_MAX_DISTANCE_KM } from '@shared/external-events/cultucat.constants';
import { throwBadRequest, throwConflict } from '@shared/errors/throw';
import { haversineDistanceKm } from '@shared/geo/haversine';
import { BookingsRepository } from '../bookings/bookings.repository';
import { BookingsService } from '../bookings/bookings.service';
import { generateRides } from '../domain/ride-generation';
import { RidesRepository } from '../rides/rides.repository';
import { toDriverRecord, type TripStatus } from '../trips.types';
import type { CancelTripDto } from './dto/cancel-trip.dto';
import type { CreateTripDto } from './dto/create-trip.dto';
import type { MeTripsQueryDto } from './dto/me-trips-query.dto';
import type { UpdateTripDto } from './dto/update-trip.dto';
import { toTripDetailResponse, toTripResponse } from './trips.mapper';
import { TripsRepository } from './trips.repository';

const SCHEDULE_FIELDS = [
  'departureAt',
  'schedule',
  'startDate',
  'endDate',
] as const satisfies readonly (keyof UpdateTripDto)[];
const SENSITIVE_FIELDS = [
  'origin',
  'destination',
  'seatsOffered',
  'carId',
] as const satisfies readonly (keyof UpdateTripDto)[];
type SensitiveField = (typeof SENSITIVE_FIELDS)[number];
type SensitiveUpdate = Pick<UpdateTripDto, SensitiveField>;

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly config: ConfigService,
    private readonly routingService: RoutingService,
    private readonly cultucatService: CultucatService,
    private readonly tripsRepo: TripsRepository,
    private readonly ridesRepo: RidesRepository,
    private readonly bookingsRepo: BookingsRepository,
    private readonly bookingsService: BookingsService,
    private readonly trustedContactService: TrustedContactService,
  ) {}

  async create(driverId: string, body: CreateTripDto) {
    const car = await this.loadOwnedCarOrThrow(this.db, body.carId, driverId);
    const destination = body.destination;

    if (body.externalEventContext) {
      await this.validateExternalEventContext(
        body.externalEventContext,
        destination,
      );
    }

    const route = await this.routingService.getRoute(
      { lat: body.origin.lat, lng: body.origin.lng },
      { lat: destination.lat, lng: destination.lng },
    );

    const totalDistanceKm = Math.round(route.distanceKm * 100) / 100;
    const estimatedDurationMinutes = Math.round(route.durationMinutes);

    const tripId = randomUUID();

    const insertedTripId = await this.db.transaction(async (tx) => {
      await this.trustedContactService.assertHasContact(tx, driverId);
      await this.tripsRepo.insertOne(tx, {
        id: tripId,
        driverId,
        carId: car.id,
        type: body.type,
        status: 'active',
        originLabel: body.origin.label,
        originLat: body.origin.lat,
        originLng: body.origin.lng,
        destinationLabel: destination.label,
        destinationLat: destination.lat,
        destinationLng: destination.lng,
        conversationStyle: body.conversationStyle ?? null,
        smokeAllowed: body.smokeAllowed ?? false,
        musicAllowed: body.musicAllowed,
        musicGenre: body.musicGenre ?? null,
        externalEventProvider: body.externalEventContext
          ? CULTUCAT_PROVIDER
          : null,
        externalEventId: body.externalEventContext?.eventId ?? null,
        departureAt: body.departureAt ?? null,
        schedule: body.schedule ?? null,
        seatsOffered: body.seatsOffered,
        pricePerSeatCents: body.pricePerSeatCents,
        totalDistanceKm,
        estimatedDurationMinutes,
        routePolyline: route.polyline,
      });

      const generated = this.generateRidesForCreate(tripId, body, destination, {
        totalDistanceKm,
      });
      if (generated.length === 0) {
        // Recurring window straddles "now" but every matching weekday/timeOfDay
        // has already passed. DTO catches the simple `endDate < today` case;
        // this catches the harder one (e.g. today is Fri 10:00, schedule is
        // M-F 08:00, endDate is today).
        throwBadRequest(
          'NO_FUTURE_RIDES_IN_WINDOW',
          'No future rides would be generated for this schedule',
        );
      }

      await this.ridesRepo.bulkInsert(tx, generated);

      return tripId;
    });

    return this.getById(insertedTripId);
  }

  async listMine(driverId: string, query: MeTripsQueryDto) {
    const statuses: TripStatus[] = query.status ?? ['active', 'cancelled'];

    const rows = await this.tripsRepo.listMineWithDriver(
      this.db,
      driverId,
      statuses,
    );

    const total = rows.length;
    const offset = (query.page - 1) * query.limit;
    const items = rows
      .slice(offset, offset + query.limit)
      .map((row) =>
        toTripResponse(row.trip, toDriverRecord(row), row.co2KgPerKm),
      );

    return { items, page: query.page, limit: query.limit, total };
  }

  async getById(tripId: string) {
    const row = await this.loadTripWithDriverOrThrow(this.db, tripId);
    return toTripDetailResponse(row.trip, toDriverRecord(row), row.co2KgPerKm);
  }

  async update(tripId: string, driverId: string, body: UpdateTripDto) {
    const scheduleFieldPresent = SCHEDULE_FIELDS.some(
      (key) => body[key] !== undefined,
    );
    if (scheduleFieldPresent) {
      throwBadRequest(
        'SCHEDULE_FIELDS_IMMUTABLE',
        'Schedule fields are immutable; cancel and recreate the trip to change them',
      );
    }

    return this.db.transaction(async (tx) => {
      await this.assertIsTripDriver(tx, tripId, driverId);
      const existing = await this.loadTripOrThrow(tx, tripId);

      const sensitive = this.extractSensitiveUpdate(body);
      const carIdToValidate = sensitive.carId ?? null;
      if (carIdToValidate) {
        await this.loadOwnedCarOrThrow(tx, carIdToValidate, driverId);
      }

      if (this.hasSensitiveChange(sensitive)) {
        const blocking =
          await this.ridesRepo.findFutureActiveBlockingSensitiveEdit(
            tx,
            tripId,
          );
        if (blocking.length > 0) {
          throwConflict(
            'ACTIVE_BOOKINGS_PRESENT',
            'Sensitive trip fields cannot be edited while future ACTIVE rides have non-terminal bookings',
            { rideIds: blocking, count: blocking.length },
          );
        }
      }

      const route = await this.maybeRecomputeRoute(existing, sensitive);

      await this.tripsRepo.update(
        tx,
        tripId,
        this.buildTripUpdate(body, sensitive, route),
      );

      if (this.hasSensitiveChange(sensitive)) {
        await this.resnapshotFutureActiveRides(tx, tripId, sensitive, route);
      }

      const refreshed = await this.loadTripWithDriverOrThrow(tx, tripId);
      return toTripDetailResponse(
        refreshed.trip,
        toDriverRecord(refreshed),
        refreshed.co2KgPerKm,
      );
    });
  }

  async cancel(
    tripId: string,
    driverId: string,
    body: CancelTripDto,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.assertIsTripDriver(tx, tripId, driverId);

      await this.tripsRepo.cancel(tx, tripId, body.cancellationReason ?? null);

      const future = await this.ridesRepo.findFutureActiveByTrip(tx, tripId);
      const rideIds = future.map((r) => r.id);
      await this.ridesRepo.cancelMany(
        tx,
        rideIds,
        body.cancellationReason ?? null,
      );

      // Funnel each affected booking through the resolution seam so any
      // active hold is released. Replaces the bulk
      // `bookingsRepo.rejectActiveInRides`.
      if (rideIds.length > 0) {
        const targets = await this.bookingsRepo.findActiveByRides(tx, rideIds);
        for (const t of targets) {
          await this.bookingsService.markBookingResolved(tx, t.id, 'rejected');
        }
      }

      this.logger.log(
        `Cancelled trip ${tripId}; cascaded to ${rideIds.length} future ride(s)`,
      );
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private generateRidesForCreate(
    tripId: string,
    body: CreateTripDto,
    destination: { label: string; lat: number; lng: number },
    snapshot: { totalDistanceKm: number },
  ): InsertRide[] {
    const common = {
      tripId,
      origin: body.origin,
      destination,
      totalDistanceKm: snapshot.totalDistanceKm,
      seatsOffered: body.seatsOffered,
    };

    if (body.type === 'sporadic') {
      // DTO validation guarantees departureAt is present for sporadic.
      return generateRides({
        ...common,
        tripType: 'sporadic',
        departureAt: body.departureAt!,
      });
    }

    return generateRides({
      ...common,
      tripType: 'recurring',
      schedule: body.schedule!,
      startDate: body.startDate!,
      endDate: body.endDate!,
    });
  }

  private async validateExternalEventContext(
    context: { eventId: string },
    destination: { lat: number; lng: number },
  ): Promise<void> {
    const eventId = Number.parseInt(context.eventId, 10);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      throwBadRequest(
        'CULTUCAT_EVENT_NOT_FOUND',
        'CultuCat event reference is invalid.',
      );
    }

    const coordinates =
      await this.cultucatService.getEventCoordinatesForTrip(eventId);

    if (coordinates.lat === null || coordinates.lng === null) {
      throwBadRequest(
        'CULTUCAT_EVENT_NOT_FOUND',
        'CultuCat event has no location and cannot be used for a trip.',
      );
    }

    const distanceKm = haversineDistanceKm(destination, {
      lat: coordinates.lat,
      lng: coordinates.lng,
    });
    const maxDistanceKm =
      this.config.get<number>('CULTUCAT_EVENT_MAX_DISTANCE_KM') ??
      DEFAULT_CULTUCAT_EVENT_MAX_DISTANCE_KM;

    if (distanceKm > maxDistanceKm) {
      throwBadRequest(
        'BAD_REQUEST',
        `Trip destination is ${distanceKm.toFixed(2)} km from the CultuCat event; it must be within ${maxDistanceKm} km.`,
      );
    }
  }

  private extractSensitiveUpdate(body: UpdateTripDto): SensitiveUpdate {
    const out: SensitiveUpdate = {};
    for (const key of SENSITIVE_FIELDS) {
      if (body[key] !== undefined) {
        (out as Record<SensitiveField, unknown>)[key] = body[key];
      }
    }
    return out;
  }

  private hasSensitiveChange(s: SensitiveUpdate): boolean {
    return SENSITIVE_FIELDS.some((k) => s[k] !== undefined);
  }

  private async maybeRecomputeRoute(
    existing: Trip,
    sensitive: SensitiveUpdate,
  ) {
    if (sensitive.origin === undefined && sensitive.destination === undefined) {
      return null;
    }
    const origin = sensitive.origin ?? {
      label: existing.originLabel,
      lat: existing.originLat,
      lng: existing.originLng,
    };
    const destination = sensitive.destination ?? {
      label: existing.destinationLabel,
      lat: existing.destinationLat,
      lng: existing.destinationLng,
    };
    const route = await this.routingService.getRoute(
      { lat: origin.lat, lng: origin.lng },
      { lat: destination.lat, lng: destination.lng },
    );
    return {
      totalDistanceKm: Math.round(route.distanceKm * 100) / 100,
      estimatedDurationMinutes: Math.round(route.durationMinutes),
      polyline: route.polyline,
    };
  }

  private buildTripUpdate(
    body: UpdateTripDto,
    sensitive: SensitiveUpdate,
    route: {
      totalDistanceKm: number;
      estimatedDurationMinutes: number;
      polyline: string | null;
    } | null,
  ) {
    return {
      ...(sensitive.origin && {
        originLabel: sensitive.origin.label,
        originLat: sensitive.origin.lat,
        originLng: sensitive.origin.lng,
      }),
      ...(sensitive.destination && {
        destinationLabel: sensitive.destination.label,
        destinationLat: sensitive.destination.lat,
        destinationLng: sensitive.destination.lng,
      }),
      ...(sensitive.seatsOffered !== undefined && {
        seatsOffered: sensitive.seatsOffered,
      }),
      ...(sensitive.carId !== undefined && { carId: sensitive.carId }),
      ...(route !== null && {
        totalDistanceKm: route.totalDistanceKm,
        estimatedDurationMinutes: route.estimatedDurationMinutes,
        routePolyline: route.polyline,
      }),
      ...(body.conversationStyle !== undefined && {
        conversationStyle: body.conversationStyle ?? null,
      }),
      ...(body.smokeAllowed !== undefined && {
        smokeAllowed: body.smokeAllowed,
      }),
      ...(body.musicAllowed !== undefined && {
        musicAllowed: body.musicAllowed,
      }),
      ...(body.musicAllowed === false && { musicGenre: null }),
      ...(body.musicGenre !== undefined &&
        body.musicAllowed !== false && { musicGenre: body.musicGenre }),
      ...(body.pricePerSeatCents !== undefined && {
        pricePerSeatCents: body.pricePerSeatCents,
      }),
    };
  }

  private async resnapshotFutureActiveRides(
    tx: DbClient,
    tripId: string,
    sensitive: SensitiveUpdate,
    route: {
      totalDistanceKm: number;
      estimatedDurationMinutes: number;
      polyline: string | null;
    } | null,
  ): Promise<void> {
    const futureRides = await this.ridesRepo.findFutureActiveByTrip(tx, tripId);
    if (futureRides.length === 0) {
      return;
    }

    const patch = {
      ...(sensitive.origin && {
        originLabel: sensitive.origin.label,
        originLat: sensitive.origin.lat,
        originLng: sensitive.origin.lng,
      }),
      ...(sensitive.destination && {
        destinationLabel: sensitive.destination.label,
        destinationLat: sensitive.destination.lat,
        destinationLng: sensitive.destination.lng,
      }),
      ...(sensitive.seatsOffered !== undefined && {
        seatsOffered: sensitive.seatsOffered,
      }),
      ...(route !== null && { totalDistanceKm: route.totalDistanceKm }),
    };

    if (Object.keys(patch).length === 0) {
      return;
    }

    await this.ridesRepo.updateMany(
      tx,
      futureRides.map((r) => r.id),
      patch,
    );
  }

  private async assertIsTripDriver(
    tx: DbClient,
    tripId: string,
    userId: string,
  ): Promise<void> {
    const driverId = await this.tripsRepo.findDriverId(tx, tripId);
    if (driverId === null) {
      throw new NotFoundException('Trip not found');
    }
    if (driverId !== userId) {
      throw new ForbiddenException('You are not the trip driver');
    }
  }

  private async loadTripOrThrow(tx: DbClient, tripId: string): Promise<Trip> {
    const row = await this.tripsRepo.findById(tx, tripId);
    if (!row) {
      throw new NotFoundException('Trip not found');
    }
    return row;
  }

  private async loadTripWithDriverOrThrow(tx: DbClient, tripId: string) {
    const row = await this.tripsRepo.findWithDriverById(tx, tripId);
    if (!row) {
      throw new NotFoundException('Trip not found');
    }
    return row;
  }

  private async loadOwnedCarOrThrow(
    tx: DbClient,
    carId: string,
    driverId: string,
  ) {
    const car = await this.tripsRepo.findOwnedCar(tx, carId);
    if (!car) {
      throw new BadRequestException('Car not found');
    }
    if (car.userId !== driverId) {
      throwBadRequest('CAR_NOT_OWNED', 'You do not own this car');
    }
    return car;
  }
}
