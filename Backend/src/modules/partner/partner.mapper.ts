import type {
  RideDetailResponseDto,
  RideSearchItemDto,
} from '@modules/trips/rides/dto/rides-response.dto';
import { PartnerRideDto } from './dto/partner-ride.dto';
import { decodePolyline } from './polyline';

// RideSearchItemDto and RideDetailResponseDto are structurally identical
// (RideResponseDto + trip), so a single mapper covers search and detail.
type InternalRide = RideSearchItemDto | RideDetailResponseDto;

export const toPartnerRide = (ride: InternalRide): PartnerRideDto => {
  const polyline = ride.trip.routePolyline ?? null;
  return {
    id: ride.id,
    departureTime: ride.scheduledDeparture,
    status: ride.status,
    origin: ride.origin,
    destination: ride.destination,
    totalDistanceKm: ride.totalDistanceKm,
    availableSeats: ride.seatsOffered - ride.seatsOccupied,
    driverName: ride.trip.driverName,
    driverOrganization: ride.trip.driverOrganization?.name ?? null,
    smokeAllowed: ride.trip.smokeAllowed,
    musicAllowed: ride.trip.musicAllowed,
    routePolyline: polyline,
    routeCoordinates: polyline ? decodePolyline(polyline) : null,
  };
};
