import type { Ride } from '@core/database/schema/rides.schema';
import type { Trip } from '@core/database/schema/trips.schema';
import {
  toRideDetailResponse,
  toRideResponse,
  toRideSearchItem,
} from './rides.mapper';

const BASE_RIDE: Ride = {
  id: 'ride_1',
  tripId: 'trip_1',
  scheduledDeparture: new Date('2026-05-02T08:30:00.000Z'),
  status: 'active',
  originLabel: 'Mataro',
  originLat: 41.5381,
  originLng: 2.4445,
  destinationLabel: 'UPF Ciutadella',
  destinationLat: 41.3888,
  destinationLng: 2.1925,
  totalDistanceKm: 34.52,
  seatsOffered: 3,
  seatsOccupied: 1,
  actualCo2SavedKg: null,
  lastTrafficDelayNotifiedSeconds: null,
  startedAt: null,
  flaggedForReview: false,
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
};

const BASE_TRIP: Trip = {
  id: 'trip_1',
  driverId: 'usr_driver',
  carId: 'car_1',
  type: 'sporadic',
  status: 'active',
  originLabel: 'Mataro',
  originLat: 41.5381,
  originLng: 2.4445,
  destinationLabel: 'UPF Ciutadella',
  destinationLat: 41.3888,
  destinationLng: 2.1925,
  conversationStyle: 'casual',
  smokeAllowed: false,
  musicAllowed: true,
  musicGenre: 'indie',
  externalEventProvider: null,
  externalEventId: null,
  departureAt: new Date('2026-05-02T08:30:00.000Z'),
  schedule: null,
  seatsOffered: 3,
  pricePerSeatCents: 500,
  totalDistanceKm: 34.52,
  estimatedDurationMinutes: 28,
  routePolyline: null,
  cancelledAt: null,
  cancellationReason: null,
  archivedAt: null,
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
};

const DRIVER = {
  id: 'usr_driver',
  name: 'Aitana Perez',
  organization: { id: 'org_1', name: 'UPC' },
};

const CAR_MODEL = { brand: 'Toyota', name: 'Prius' };

describe('toRideResponse', () => {
  it('maps the ride into nested origin and destination point objects', () => {
    const response = toRideResponse(BASE_RIDE);

    expect(response.origin).toEqual({
      label: 'Mataro',
      lat: 41.5381,
      lng: 2.4445,
    });
    expect(response.destination).toEqual({
      label: 'UPF Ciutadella',
      lat: 41.3888,
      lng: 2.1925,
    });
  });

  it('passes through every public ride field', () => {
    const response = toRideResponse(BASE_RIDE);

    expect(response.id).toBe('ride_1');
    expect(response.tripId).toBe('trip_1');
    expect(response.scheduledDeparture).toEqual(BASE_RIDE.scheduledDeparture);
    expect(response.status).toBe('active');
    expect(response.totalDistanceKm).toBe(34.52);
    expect(response.seatsOffered).toBe(3);
    expect(response.seatsOccupied).toBe(1);
  });

  it('defaults nullable lifecycle fields to null when undefined on the row', () => {
    const response = toRideResponse({
      ...BASE_RIDE,
      actualCo2SavedKg: undefined as unknown as number | null,
      completedAt: undefined as unknown as Date | null,
      cancelledAt: undefined as unknown as Date | null,
      cancellationReason: undefined as unknown as string | null,
    });

    expect(response.actualCo2SavedKg).toBeNull();
    expect(response.completedAt).toBeNull();
    expect(response.cancelledAt).toBeNull();
    expect(response.cancellationReason).toBeNull();
  });

  it('forwards completion data when a ride has been completed', () => {
    const completedAt = new Date('2026-05-02T10:00:00.000Z');
    const response = toRideResponse({
      ...BASE_RIDE,
      status: 'completed',
      completedAt,
      actualCo2SavedKg: 4.08,
    });

    expect(response.completedAt).toEqual(completedAt);
    expect(response.actualCo2SavedKg).toBe(4.08);
    expect(response.status).toBe('completed');
  });

  it('forwards cancellation data when a ride has been cancelled', () => {
    const cancelledAt = new Date('2026-05-01T22:00:00.000Z');
    const response = toRideResponse({
      ...BASE_RIDE,
      status: 'cancelled',
      cancelledAt,
      cancellationReason: 'driver_cancelled',
    });

    expect(response.cancelledAt).toEqual(cancelledAt);
    expect(response.cancellationReason).toBe('driver_cancelled');
  });
});

describe('toRideDetailResponse', () => {
  it('embeds a trip summary alongside the ride response fields', () => {
    const response = toRideDetailResponse(
      BASE_RIDE,
      BASE_TRIP,
      DRIVER,
      CAR_MODEL,
    );

    expect(response.id).toBe('ride_1');
    expect(response.trip).toEqual({
      tripId: 'trip_1',
      tripType: 'sporadic',
      driverId: 'usr_driver',
      driverName: 'Aitana Perez',
      pricePerSeatCents: 500,
      driverOrganization: { id: 'org_1', name: 'UPC' },
      conversationStyle: 'casual',
      smokeAllowed: false,
      musicAllowed: true,
      musicGenre: 'indie',
      carModelBrand: 'Toyota',
      carModelName: 'Prius',
      routePolyline: null,
    });
  });

  it('passes the trip routePolyline through to the trip summary', () => {
    const response = toRideDetailResponse(
      BASE_RIDE,
      { ...BASE_TRIP, routePolyline: 'a~lE_p`u@' },
      DRIVER,
      CAR_MODEL,
    );

    expect(response.trip.routePolyline).toBe('a~lE_p`u@');
  });

  it('defaults car model brand and name to null when the car model is null', () => {
    const response = toRideDetailResponse(BASE_RIDE, BASE_TRIP, DRIVER, null);

    expect(response.trip.carModelBrand).toBeNull();
    expect(response.trip.carModelName).toBeNull();
  });

  it('passes a null driverOrganization through unchanged', () => {
    const response = toRideDetailResponse(
      BASE_RIDE,
      BASE_TRIP,
      { ...DRIVER, organization: null },
      CAR_MODEL,
    );

    expect(response.trip.driverOrganization).toBeNull();
  });

  it('defaults individual nullable car model brand/name fields to null', () => {
    const response = toRideDetailResponse(BASE_RIDE, BASE_TRIP, DRIVER, {
      brand: null,
      name: null,
    });

    expect(response.trip.carModelBrand).toBeNull();
    expect(response.trip.carModelName).toBeNull();
  });
});

describe('toRideSearchItem', () => {
  it('produces the same shape as toRideDetailResponse for the public search list', () => {
    const detail = toRideDetailResponse(
      BASE_RIDE,
      BASE_TRIP,
      DRIVER,
      CAR_MODEL,
    );
    const item = toRideSearchItem(BASE_RIDE, BASE_TRIP, DRIVER, CAR_MODEL);

    expect(item).toEqual(detail);
  });

  it('surfaces price-per-seat from the parent trip onto the search item', () => {
    const item = toRideSearchItem(
      BASE_RIDE,
      { ...BASE_TRIP, pricePerSeatCents: 1200 },
      DRIVER,
      CAR_MODEL,
    );

    expect(item.trip.pricePerSeatCents).toBe(1200);
  });
});
