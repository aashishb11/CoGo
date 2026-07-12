import { AgendaIcsService } from './agenda-ics.service';
import type {
  AgendaDriverItemDto,
  AgendaPassengerItemDto,
} from './dto/agenda-response.dto';

const driverItem = (
  overrides: Partial<AgendaDriverItemDto> = {},
): AgendaDriverItemDto => ({
  role: 'driver',
  rideId: 'ride_1',
  tripId: 'trip_1',
  tripType: 'sporadic',
  status: 'active',
  scheduledDeparture: new Date('2026-06-01T08:30:00.000Z'),
  startedAt: null,
  completedAt: null,
  actualCo2SavedKg: null,
  origin: { label: 'Plaça Catalunya', lat: 41.387, lng: 2.17 },
  destination: { label: 'UPC Campus Nord', lat: 41.389, lng: 2.113 },
  totalDistanceKm: 5.2,
  estimatedDurationMinutes: 20,
  estimatedCo2SavingsPerSeatKg: 0.6,
  pricePerSeatCents: 500,
  pendingBookingCount: 2,
  seatsOccupied: 1,
  seatsOffered: 3,
  ...overrides,
});

const passengerItem = (
  overrides: Partial<AgendaPassengerItemDto> = {},
): AgendaPassengerItemDto => ({
  role: 'passenger',
  rideId: 'ride_2',
  tripId: 'trip_2',
  tripType: 'sporadic',
  status: 'active',
  scheduledDeparture: new Date('2026-06-02T09:00:00.000Z'),
  startedAt: null,
  completedAt: null,
  actualCo2SavedKg: null,
  origin: { label: 'Sants', lat: 41.379, lng: 2.14 },
  destination: { label: 'Diagonal', lat: 41.391, lng: 2.16 },
  totalDistanceKm: 3.1,
  estimatedDurationMinutes: null,
  estimatedCo2SavingsPerSeatKg: null,
  pricePerSeatCents: 500,
  myBookingId: 'bk_1',
  myBookingStatus: 'accepted',
  driver: { id: 'usr_9', name: 'Aitana Pérez', avatar: null },
  car: { brand: 'Seat', model: 'Ibiza', color: 'black', plate: 'TEST-1234' },
  smokeAllowed: false,
  musicAllowed: true,
  conversationStyle: 'casual',
  musicGenre: 'indie',
  ...overrides,
});

describe('AgendaIcsService', () => {
  const service = new AgendaIcsService();

  it('produces a valid empty VCALENDAR for an empty agenda', () => {
    const ics = service.build([]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('emits one VEVENT per item with a stable ride-scoped UID', () => {
    const ics = service.build([driverItem(), passengerItem()]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('UID:ride-ride_1@cogo.app');
    expect(ics).toContain('UID:ride-ride_2@cogo.app');
  });

  it('uses estimatedDurationMinutes for DTEND when present', () => {
    // 08:30 + 20min = 08:50
    const ics = service.build([driverItem()]);
    expect(ics).toContain('DTSTART:20260601T083000Z');
    expect(ics).toContain('DTEND:20260601T085000Z');
  });

  it('falls back to a 30-minute duration when estimatedDurationMinutes is null', () => {
    // 09:00 + 30min = 09:30
    const ics = service.build([passengerItem()]);
    expect(ics).toContain('DTSTART:20260602T090000Z');
    expect(ics).toContain('DTEND:20260602T093000Z');
  });

  it('labels the summary by role', () => {
    const ics = service.build([driverItem(), passengerItem()]);
    expect(ics).toContain('Driving:');
    expect(ics).toContain('Ride:');
  });

  it('escapes special characters in text fields', () => {
    const ics = service.build([
      driverItem({
        origin: { label: 'Home; near the church, 2nd floor', lat: 0, lng: 0 },
      }),
    ]);
    // ical-generator escapes commas and semicolons in property values.
    expect(ics).toContain('Home\\; near the church\\, 2nd floor');
  });
});
