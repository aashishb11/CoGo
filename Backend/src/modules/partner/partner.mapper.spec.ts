import type { RideDetailResponseDto } from '@modules/trips/rides/dto/rides-response.dto';
import { toPartnerRide } from './partner.mapper';

const buildInternalRide = (
  overrides: Partial<RideDetailResponseDto> = {},
): RideDetailResponseDto => ({
  id: 'ride_1',
  tripId: 'trip_1',
  scheduledDeparture: new Date('2026-05-02T08:30:00.000Z'),
  status: 'active',
  origin: { label: 'Mataró', lat: 41.5381, lng: 2.4445 },
  destination: { label: 'Barcelona', lat: 41.3851, lng: 2.1734 },
  totalDistanceKm: 34.52,
  seatsOffered: 3,
  seatsOccupied: 1,
  actualCo2SavedKg: null,
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  trip: {
    tripId: 'trip_1',
    tripType: 'sporadic',
    driverId: 'usr_driver',
    driverName: 'Aitana Pérez',
    pricePerSeatCents: 500,
    driverOrganization: { id: 'org_upc', name: 'UPC' },
    conversationStyle: 'casual',
    smokeAllowed: false,
    musicAllowed: true,
    musicGenre: 'indie',
    carModelBrand: 'Toyota',
    carModelName: 'Prius',
    routePolyline: null,
  },
  ...overrides,
});

describe('toPartnerRide', () => {
  it('maps an internal ride to the public partner shape', () => {
    expect(toPartnerRide(buildInternalRide())).toEqual({
      id: 'ride_1',
      departureTime: new Date('2026-05-02T08:30:00.000Z'),
      status: 'active',
      origin: { label: 'Mataró', lat: 41.5381, lng: 2.4445 },
      destination: { label: 'Barcelona', lat: 41.3851, lng: 2.1734 },
      totalDistanceKm: 34.52,
      availableSeats: 2,
      driverName: 'Aitana Pérez',
      driverOrganization: 'UPC',
      smokeAllowed: false,
      musicAllowed: true,
      routePolyline: null,
      routeCoordinates: null,
    });
  });

  it('passes the route polyline through and decodes it to coordinates', () => {
    // Google reference polyline from
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const polyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const ride = buildInternalRide({
      trip: { ...buildInternalRide().trip, routePolyline: polyline },
    });

    const result = toPartnerRide(ride);

    expect(result.routePolyline).toBe(polyline);
    expect(result.routeCoordinates).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it('returns null coordinates when the trip has no polyline', () => {
    const result = toPartnerRide(buildInternalRide());
    expect(result.routePolyline).toBeNull();
    expect(result.routeCoordinates).toBeNull();
  });

  it('derives availableSeats from offered minus occupied', () => {
    const ride = buildInternalRide({ seatsOffered: 4, seatsOccupied: 3 });
    expect(toPartnerRide(ride).availableSeats).toBe(1);
  });

  it('reports a null organization when the driver has none', () => {
    const ride = buildInternalRide({
      trip: { ...buildInternalRide().trip, driverOrganization: null },
    });
    expect(toPartnerRide(ride).driverOrganization).toBeNull();
  });

  it('does not leak internal-only fields', () => {
    const result = toPartnerRide(buildInternalRide());
    expect(result).not.toHaveProperty('tripId');
    expect(result).not.toHaveProperty('seatsOffered');
    expect(result).not.toHaveProperty('seatsOccupied');
    expect(result).not.toHaveProperty('cancellationReason');
    expect(result).not.toHaveProperty('actualCo2SavedKg');
  });
});
