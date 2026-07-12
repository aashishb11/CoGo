import type { Trip } from '@core/database/schema/trips.schema';
import { computeEstimatedCo2SavingsPerSeatKg } from '../domain/co2';
import type {
  DriverSummaryDto,
  TripDetailResponseDto,
  TripResponseDto,
} from './dto/trips-response.dto';

type DriverRecord = {
  id: string;
  name: string;
  organization: { id: string; name: string } | null;
};

const toPoint = (label: string, lat: number, lng: number) => ({
  label,
  lat,
  lng,
});

const toExternalEventContext = (trip: Trip) =>
  trip.externalEventProvider && trip.externalEventId
    ? {
        provider: trip.externalEventProvider,
        eventId: trip.externalEventId,
      }
    : null;

export const toDriverSummary = (
  driver: DriverRecord,
  trip: Trip,
): DriverSummaryDto => ({
  userId: driver.id,
  fullName: driver.name,
  organization: driver.organization,
  age: null,
  conversationStyle: trip.conversationStyle,
  smokeAllowed: trip.smokeAllowed,
  musicAllowed: trip.musicAllowed,
  musicGenre: trip.musicGenre,
});

export const toTripResponse = (
  trip: Trip,
  driver: DriverRecord,
  co2KgPerKm: number | null,
): TripResponseDto => ({
  id: trip.id,
  driverId: trip.driverId,
  driver: toDriverSummary(driver, trip),
  type: trip.type,
  origin: toPoint(trip.originLabel, trip.originLat, trip.originLng),
  destination: toPoint(
    trip.destinationLabel,
    trip.destinationLat,
    trip.destinationLng,
  ),
  departureAt: trip.departureAt,
  schedule: trip.schedule,
  seatsOffered: trip.seatsOffered,
  pricePerSeatCents: trip.pricePerSeatCents,
  status: trip.status,
  totalDistanceKm: trip.totalDistanceKm ?? null,
  estimatedDurationMinutes: trip.estimatedDurationMinutes ?? null,
  estimatedCo2SavingsPerSeatKg: computeEstimatedCo2SavingsPerSeatKg(
    trip.totalDistanceKm,
    co2KgPerKm,
  ),
  routePolyline: trip.routePolyline ?? null,
  cancelledAt: trip.cancelledAt ?? null,
  cancellationReason: trip.cancellationReason ?? null,
  archivedAt: trip.archivedAt ?? null,
  externalEventContext: toExternalEventContext(trip),
});

export const toTripDetailResponse = (
  trip: Trip,
  driver: DriverRecord,
  co2KgPerKm: number | null,
): TripDetailResponseDto => ({
  ...toTripResponse(trip, driver, co2KgPerKm),
  carId: trip.carId,
});
