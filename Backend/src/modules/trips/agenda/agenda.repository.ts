import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';
import type { DbClient } from '@core/database/database.module';
import {
  bookings,
  carModels,
  cars,
  rides,
  trips,
  user,
} from '@core/database/schema';
import type {
  BookingStatus,
  ConversationStyle,
  MusicGenre,
  RideStatus,
  TripType,
} from '../trips.types';

// Cancelled rides are noise. Completed rides ARE allowed (so a `from` in the
// past returns recent history alongside upcoming items, and the .ics calendar
// feed shows past events as a normal calendar does). The DTO surfaces
// `status` so the FE can branch its rendering.
const AGENDA_RIDE_STATUSES: RideStatus[] = [
  'active',
  'in_progress',
  'completed',
];

export type RawAgendaRow = {
  role: 'driver' | 'passenger';
  ride_id: string;
  ride_status: Extract<RideStatus, 'active' | 'in_progress' | 'completed'>;
  started_at: Date | null;
  completed_at: Date | null;
  actual_co2_saved_kg: number | null;
  trip_id: string;
  trip_type: TripType;
  scheduled_departure: Date;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  total_distance_km: number;
  estimated_duration_minutes: number | null;
  co2_kg_per_km: number | null;
  price_per_seat_cents: number;
  smoke_allowed: boolean;
  music_allowed: boolean;
  conversation_style: ConversationStyle | null;
  music_genre: MusicGenre | null;
  pending_booking_count: number | null;
  seats_occupied: number | null;
  seats_offered: number | null;
  my_booking_id: string | null;
  my_booking_status: Extract<BookingStatus, 'accepted' | 'pending'> | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_avatar: string | null;
  car_brand: string | null;
  car_model_name: string | null;
  car_color: string | null;
  car_plate: string | null;
};

@Injectable()
export class AgendaRepository {
  // pre: driver and passenger arms never share a ride id (a trip's driver
  // cannot book their own rides), so UNION ALL is sound without dedup.
  async listForUser(
    tx: DbClient,
    userId: string,
    fromIso: string,
    toIso: string,
    bookingStatuses: BookingStatus[],
  ): Promise<RawAgendaRow[]> {
    const driverArm = tx
      .select({
        role: sql<'driver' | 'passenger'>`'driver'::text`.as('role'),
        ride_id: rides.id,
        ride_status: sql<
          Extract<RideStatus, 'active' | 'in_progress' | 'completed'>
        >`${rides.status}`.as('ride_status'),
        started_at: rides.startedAt,
        completed_at: rides.completedAt,
        actual_co2_saved_kg: rides.actualCo2SavedKg,
        trip_id: rides.tripId,
        trip_type: trips.type,
        scheduled_departure: rides.scheduledDeparture,
        origin_label: rides.originLabel,
        origin_lat: rides.originLat,
        origin_lng: rides.originLng,
        destination_label: rides.destinationLabel,
        destination_lat: rides.destinationLat,
        destination_lng: rides.destinationLng,
        total_distance_km: rides.totalDistanceKm,
        estimated_duration_minutes: trips.estimatedDurationMinutes,
        co2_kg_per_km: carModels.co2KgPerKm,
        price_per_seat_cents: trips.pricePerSeatCents,
        smoke_allowed: trips.smokeAllowed,
        music_allowed: trips.musicAllowed,
        conversation_style: trips.conversationStyle,
        music_genre: trips.musicGenre,
        pending_booking_count: sql<number | null>`(
          SELECT COUNT(*)::int FROM ${bookings}
          WHERE ${bookings.rideId} = ${rides.id} AND ${bookings.status} = 'pending'
        )`.as('pending_booking_count'),
        seats_occupied: sql<number | null>`${rides.seatsOccupied}`.as(
          'seats_occupied',
        ),
        seats_offered: sql<number | null>`${rides.seatsOffered}`.as(
          'seats_offered',
        ),
        my_booking_id: sql<string | null>`NULL::text`.as('my_booking_id'),
        my_booking_status: sql<Extract<
          BookingStatus,
          'accepted' | 'pending'
        > | null>`NULL::text`.as('my_booking_status'),
        driver_id: sql<string | null>`NULL::text`.as('driver_id'),
        driver_name: sql<string | null>`NULL::text`.as('driver_name'),
        driver_avatar: sql<string | null>`NULL::text`.as('driver_avatar'),
        car_brand: sql<string | null>`NULL::text`.as('car_brand'),
        car_model_name: sql<string | null>`NULL::text`.as('car_model_name'),
        car_color: sql<string | null>`NULL::text`.as('car_color'),
        car_plate: sql<string | null>`NULL::text`.as('car_plate'),
      })
      .from(rides)
      .innerJoin(trips, eq(trips.id, rides.tripId))
      .innerJoin(cars, eq(cars.id, trips.carId))
      .leftJoin(carModels, eq(carModels.id, cars.modelId))
      .where(
        and(
          eq(trips.driverId, userId),
          inArray(rides.status, AGENDA_RIDE_STATUSES),
          gte(rides.scheduledDeparture, sql`${fromIso}::timestamp`),
          lt(rides.scheduledDeparture, sql`${toIso}::timestamp`),
        ),
      );

    const passengerArm = tx
      .select({
        role: sql<'driver' | 'passenger'>`'passenger'::text`.as('role'),
        ride_id: rides.id,
        ride_status: sql<
          Extract<RideStatus, 'active' | 'in_progress' | 'completed'>
        >`${rides.status}`.as('ride_status'),
        started_at: rides.startedAt,
        completed_at: rides.completedAt,
        actual_co2_saved_kg: rides.actualCo2SavedKg,
        trip_id: rides.tripId,
        trip_type: trips.type,
        scheduled_departure: rides.scheduledDeparture,
        origin_label: rides.originLabel,
        origin_lat: rides.originLat,
        origin_lng: rides.originLng,
        destination_label: rides.destinationLabel,
        destination_lat: rides.destinationLat,
        destination_lng: rides.destinationLng,
        total_distance_km: rides.totalDistanceKm,
        estimated_duration_minutes: trips.estimatedDurationMinutes,
        co2_kg_per_km: carModels.co2KgPerKm,
        price_per_seat_cents: trips.pricePerSeatCents,
        smoke_allowed: trips.smokeAllowed,
        music_allowed: trips.musicAllowed,
        conversation_style: trips.conversationStyle,
        music_genre: trips.musicGenre,
        pending_booking_count: sql<number | null>`NULL::int`.as(
          'pending_booking_count',
        ),
        seats_occupied: sql<number | null>`NULL::int`.as('seats_occupied'),
        seats_offered: sql<number | null>`NULL::int`.as('seats_offered'),
        my_booking_id: sql<string | null>`${bookings.id}`.as('my_booking_id'),
        my_booking_status: sql<Extract<
          BookingStatus,
          'accepted' | 'pending'
        > | null>`${bookings.status}`.as('my_booking_status'),
        driver_id: sql<string | null>`${user.id}`.as('driver_id'),
        driver_name: sql<string | null>`${user.name}`.as('driver_name'),
        driver_avatar: user.image,
        car_brand: carModels.brand,
        car_model_name: carModels.name,
        car_color: cars.color,
        car_plate: sql<string | null>`${cars.plate}`.as('car_plate'),
      })
      .from(bookings)
      .innerJoin(rides, eq(rides.id, bookings.rideId))
      .innerJoin(trips, eq(trips.id, rides.tripId))
      .innerJoin(user, eq(user.id, trips.driverId))
      .innerJoin(cars, eq(cars.id, trips.carId))
      .leftJoin(carModels, eq(carModels.id, cars.modelId))
      .where(
        and(
          eq(bookings.passengerId, userId),
          inArray(bookings.status, bookingStatuses),
          inArray(rides.status, AGENDA_RIDE_STATUSES),
          gte(rides.scheduledDeparture, sql`${fromIso}::timestamp`),
          lt(rides.scheduledDeparture, sql`${toIso}::timestamp`),
        ),
      );

    const rows = await unionAll(driverArm, passengerArm).orderBy(
      asc(sql`scheduled_departure`),
    );

    return rows as unknown as RawAgendaRow[];
  }

  async getFeedToken(tx: DbClient, userId: string): Promise<string | null> {
    const [row] = await tx
      .select({ agendaFeedToken: user.agendaFeedToken })
      .from(user)
      .where(eq(user.id, userId));
    return row?.agendaFeedToken ?? null;
  }

  async setFeedToken(
    tx: DbClient,
    userId: string,
    token: string,
  ): Promise<void> {
    await tx
      .update(user)
      .set({ agendaFeedToken: token })
      .where(eq(user.id, userId));
  }

  async findUserIdByFeedToken(
    tx: DbClient,
    token: string,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.agendaFeedToken, token));
    return row?.id ?? null;
  }
}
