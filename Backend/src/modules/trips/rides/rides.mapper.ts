import type { Ride } from '@core/database/schema/rides.schema';
import type { Trip } from '@core/database/schema/trips.schema';
import type {
  RideDetailResponseDto,
  RideResponseDto,
  RideSearchItemDto,
  TripSummaryDto,
} from './dto/rides-response.dto';

type DriverRecord = {
  id: string;
  name: string;
  organization: { id: string; name: string } | null;
};
type CarModelRecord = { brand: string | null; name: string | null } | null;

export const toRideResponse = (ride: Ride): RideResponseDto => ({
  id: ride.id,
  tripId: ride.tripId,
  scheduledDeparture: ride.scheduledDeparture,
  status: ride.status,
  origin: {
    label: ride.originLabel,
    lat: ride.originLat,
    lng: ride.originLng,
  },
  destination: {
    label: ride.destinationLabel,
    lat: ride.destinationLat,
    lng: ride.destinationLng,
  },
  totalDistanceKm: ride.totalDistanceKm,
  seatsOffered: ride.seatsOffered,
  seatsOccupied: ride.seatsOccupied,
  actualCo2SavedKg: ride.actualCo2SavedKg ?? null,
  completedAt: ride.completedAt ?? null,
  cancelledAt: ride.cancelledAt ?? null,
  cancellationReason: ride.cancellationReason ?? null,
});

const toTripSummary = (
  trip: Trip,
  driver: DriverRecord,
  carModel: CarModelRecord,
): TripSummaryDto => ({
  tripId: trip.id,
  tripType: trip.type,
  driverId: driver.id,
  driverName: driver.name,
  pricePerSeatCents: trip.pricePerSeatCents,
  driverOrganization: driver.organization,
  conversationStyle: trip.conversationStyle,
  smokeAllowed: trip.smokeAllowed,
  musicAllowed: trip.musicAllowed,
  musicGenre: trip.musicGenre,
  carModelBrand: carModel?.brand ?? null,
  carModelName: carModel?.name ?? null,
  routePolyline: trip.routePolyline ?? null,
});

export const toRideDetailResponse = (
  ride: Ride,
  trip: Trip,
  driver: DriverRecord,
  carModel: CarModelRecord,
): RideDetailResponseDto => ({
  ...toRideResponse(ride),
  trip: toTripSummary(trip, driver, carModel),
});

export const toRideSearchItem = (
  ride: Ride,
  trip: Trip,
  driver: DriverRecord,
  carModel: CarModelRecord,
): RideSearchItemDto => ({
  ...toRideResponse(ride),
  trip: toTripSummary(trip, driver, carModel),
});
