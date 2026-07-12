import { toTripResponse } from './trips.mapper';

const BASE_TRIP = {
  id: 'trip_1',
  driverId: 'usr_123',
  carId: 'car_1',
  status: 'active' as const,
  originLabel: 'Mataro',
  originLat: 41.5381,
  originLng: 2.4445,
  destinationLabel: 'UPF Ciutadella',
  destinationLat: 41.3888,
  destinationLng: 2.1925,
  conversationStyle: 'casual' as const,
  smokeAllowed: true,
  musicAllowed: true,
  musicGenre: 'indie' as const,
  externalEventProvider: null,
  externalEventId: null,
  seatsOffered: 3,
  pricePerSeatCents: 500,
  totalDistanceKm: 34.52,
  cancelledAt: null,
  cancellationReason: null,
  archivedAt: null,
  estimatedDurationMinutes: 28,
  routePolyline: 'a~l~Fjk~uOwHJy@P',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DRIVER = {
  id: 'usr_123',
  name: 'Aitana Perez',
  organization: null,
};

describe('trips.mapper', () => {
  it('exposes a safe driver summary without auth-sensitive fields', () => {
    const response = toTripResponse(
      {
        ...BASE_TRIP,
        type: 'sporadic',
        departureAt: new Date('2026-03-28T08:30:00.000Z'),
        schedule: null,
      },
      DRIVER,
      0.12,
    );

    expect(response.driver).toEqual({
      userId: 'usr_123',
      fullName: 'Aitana Perez',
      organization: null,
      age: null,
      conversationStyle: 'casual',
      smokeAllowed: true,
      musicAllowed: true,
      musicGenre: 'indie',
    });
    expect(response.driver).not.toHaveProperty('email');
    expect(response.driver).not.toHaveProperty('password');
    expect(response.driver).not.toHaveProperty('token');
    expect(response.driver).not.toHaveProperty('session');
  });

  it('maps a sporadic trip with departureAt and null schedule', () => {
    const departureAt = new Date('2026-04-01T08:00:00.000Z');
    const response = toTripResponse(
      { ...BASE_TRIP, type: 'sporadic', departureAt, schedule: null },
      DRIVER,
      0.12,
    );

    expect(response.type).toBe('sporadic');
    expect(response.departureAt).toEqual(departureAt);
    expect(response.schedule).toBeNull();
  });

  it('maps a recurring trip with schedule.daysOfWeek and schedule.timeOfDay', () => {
    const schedule = {
      daysOfWeek: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
      },
      timeOfDay: '08:30',
    };

    const response = toTripResponse(
      { ...BASE_TRIP, type: 'recurring', departureAt: null, schedule },
      DRIVER,
      0.12,
    );

    expect(response.type).toBe('recurring');
    expect(response.departureAt).toBeNull();
    expect(response.schedule).toEqual(schedule);
  });

  it('derives estimatedCo2SavingsPerSeatKg from totalDistanceKm and co2KgPerKm', () => {
    const response = toTripResponse(
      {
        ...BASE_TRIP,
        type: 'sporadic',
        departureAt: new Date(),
        schedule: null,
      },
      DRIVER,
      0.12,
    );

    // 34.52 km × 0.12 kg/km = 4.1424, rounded to 4.14
    expect(response.estimatedCo2SavingsPerSeatKg).toBe(4.14);
  });

  it('returns null estimatedCo2SavingsPerSeatKg when co2KgPerKm is missing', () => {
    const response = toTripResponse(
      {
        ...BASE_TRIP,
        type: 'sporadic',
        departureAt: new Date(),
        schedule: null,
      },
      DRIVER,
      null,
    );

    expect(response.estimatedCo2SavingsPerSeatKg).toBeNull();
  });

  it('returns null estimatedCo2SavingsPerSeatKg when totalDistanceKm is missing', () => {
    const response = toTripResponse(
      {
        ...BASE_TRIP,
        type: 'sporadic',
        departureAt: new Date(),
        schedule: null,
        totalDistanceKm: null,
      },
      DRIVER,
      0.12,
    );

    expect(response.estimatedCo2SavingsPerSeatKg).toBeNull();
  });

  it('maps origin and destination coordinates into point objects', () => {
    const response = toTripResponse(
      {
        ...BASE_TRIP,
        type: 'sporadic',
        departureAt: new Date(),
        schedule: null,
      },
      DRIVER,
      0.12,
    );

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
});
