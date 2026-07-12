import { randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import type { BookingStatus } from '../trips.types';
import { AgendaItemDto, AgendaResponseDto } from './dto/agenda-response.dto';
import { MeAgendaQueryDto } from './dto/me-agenda-query.dto';
import { toAgendaDriverItem, toAgendaPassengerItem } from './agenda.mapper';
import { AgendaRepository } from './agenda.repository';
import { AgendaIcsService } from './agenda-ics.service';
import type { RawAgendaRow } from './agenda.repository';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_PASSENGER_BOOKING_STATUSES: BookingStatus[] = [
  'pending',
  'accepted',
];

// The .ics feed uses a wider window than the JSON agenda: a calendar should
// keep recently-past rides visible and surface rides scheduled further out.
const FEED_PAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FEED_FUTURE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class AgendaService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly agendaRepo: AgendaRepository,
    private readonly icsService: AgendaIcsService,
    private readonly config: ConfigService,
  ) {}

  async listMine(
    userId: string,
    query: MeAgendaQueryDto,
  ): Promise<AgendaResponseDto> {
    const from = (query.from ?? new Date()).toISOString();
    const to = (
      query.to ?? new Date(new Date(from).getTime() + DEFAULT_WINDOW_MS)
    ).toISOString();
    const bookingStatuses =
      query.bookingStatus ?? DEFAULT_PASSENGER_BOOKING_STATUSES;

    const rows = await this.agendaRepo.listForUser(
      this.db,
      userId,
      from,
      to,
      bookingStatuses,
    );

    return { items: this.mapRows(rows) };
  }

  async getOrCreateFeedToken(userId: string): Promise<string> {
    const existing = await this.agendaRepo.getFeedToken(this.db, userId);
    if (existing) {
      return existing;
    }
    const token = randomBytes(32).toString('base64url');
    await this.agendaRepo.setFeedToken(this.db, userId, token);
    return token;
  }

  async rotateFeedToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.agendaRepo.setFeedToken(this.db, userId, token);
    return token;
  }

  buildFeedUrl(token: string): string {
    const base = this.config.getOrThrow<string>('BETTER_AUTH_URL');
    return `${base.replace(/\/$/, '')}/api/me/agenda.ics?token=${token}`;
  }

  async buildIcsForToken(token: string): Promise<string> {
    const userId = await this.agendaRepo.findUserIdByFeedToken(this.db, token);
    if (!userId) {
      throw new UnauthorizedException('Invalid agenda feed token');
    }

    const now = Date.now();
    const from = new Date(now - FEED_PAST_WINDOW_MS).toISOString();
    const to = new Date(now + FEED_FUTURE_WINDOW_MS).toISOString();

    const rows = await this.agendaRepo.listForUser(
      this.db,
      userId,
      from,
      to,
      DEFAULT_PASSENGER_BOOKING_STATUSES,
    );

    return this.icsService.build(this.mapRows(rows));
  }

  private mapRows(rows: RawAgendaRow[]): AgendaItemDto[] {
    return rows.map((row) => {
      const scheduledDeparture = new Date(row.scheduled_departure);
      const common = {
        rideId: row.ride_id,
        rideStatus: row.ride_status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        actualCo2SavedKg: row.actual_co2_saved_kg,
        tripId: row.trip_id,
        tripType: row.trip_type,
        scheduledDeparture,
        originLabel: row.origin_label,
        originLat: row.origin_lat,
        originLng: row.origin_lng,
        destinationLabel: row.destination_label,
        destinationLat: row.destination_lat,
        destinationLng: row.destination_lng,
        totalDistanceKm: row.total_distance_km,
        estimatedDurationMinutes: row.estimated_duration_minutes,
        co2KgPerKm: row.co2_kg_per_km,
        pricePerSeatCents: row.price_per_seat_cents,
      };

      if (row.role === 'driver') {
        return toAgendaDriverItem({
          ...common,
          pendingBookingCount: row.pending_booking_count ?? 0,
          seatsOccupied: row.seats_occupied ?? 0,
          seatsOffered: row.seats_offered ?? 0,
        });
      }

      return toAgendaPassengerItem({
        ...common,
        myBookingId: row.my_booking_id ?? '',
        myBookingStatus: row.my_booking_status ?? 'accepted',
        driverId: row.driver_id ?? '',
        driverName: row.driver_name ?? '',
        driverAvatar: row.driver_avatar,
        carBrand: row.car_brand,
        carModelName: row.car_model_name,
        carColor: row.car_color,
        carPlate: row.car_plate,
        smokeAllowed: row.smoke_allowed,
        musicAllowed: row.music_allowed,
        conversationStyle: row.conversation_style,
        musicGenre: row.music_genre,
      });
    });
  }
}
