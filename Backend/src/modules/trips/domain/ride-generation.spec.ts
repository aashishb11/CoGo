import { generateRides } from './ride-generation';
import type { GenerateRidesInput } from './ride-generation';
import type { DaysOfWeek } from '../trips.types';

const ORIGIN = { label: 'Mataro', lat: 41.5381, lng: 2.4445 };
const DESTINATION = { label: 'UPF Ciutadella', lat: 41.3888, lng: 2.1925 };

const ALL_DAYS_TRUE: DaysOfWeek = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: true,
  sunday: true,
};

const ALL_DAYS_FALSE: DaysOfWeek = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,
};

const SHARED: Pick<
  GenerateRidesInput,
  'tripId' | 'origin' | 'destination' | 'totalDistanceKm' | 'seatsOffered'
> = {
  tripId: 'trip-fixture',
  origin: ORIGIN,
  destination: DESTINATION,
  totalDistanceKm: 34.52,
  seatsOffered: 3,
};

// Pinned `now` for recurring tests so test-data dates remain "future"
// regardless of when the suite runs.
const NOW_BEFORE_FIXTURES = new Date('2025-01-01T00:00:00.000Z');

describe('generateRides', () => {
  describe('sporadic', () => {
    it('returns exactly one ride at the supplied departureAt instant', () => {
      const departureAt = new Date('2026-05-04T07:30:00.000Z');
      const result = generateRides({
        ...SHARED,
        tripType: 'sporadic',
        departureAt,
      });

      expect(result).toHaveLength(1);
      expect(result[0].scheduledDeparture).toEqual(departureAt);
      expect(result[0].originLabel).toBe(ORIGIN.label);
      expect(result[0].destinationLabel).toBe(DESTINATION.label);
      expect(result[0].totalDistanceKm).toBe(34.52);
      expect(result[0].seatsOffered).toBe(3);
      expect(typeof result[0].id).toBe('string');
      expect(result[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    // Note: missing departureAt is a compile error (discriminated union),
    // not a runtime check. No corresponding test.
  });

  describe('recurring', () => {
    it('returns one ride when startDate === endDate and that weekday is enabled', () => {
      // 2026-04-27 is a Monday in Madrid.
      const result = generateRides(
        {
          ...SHARED,
          tripType: 'recurring',
          schedule: { daysOfWeek: ALL_DAYS_TRUE, timeOfDay: '08:00' },
          startDate: '2026-04-27',
          endDate: '2026-04-27',
        },
        NOW_BEFORE_FIXTURES,
      );

      expect(result).toHaveLength(1);
      // 08:00 Madrid in late April = UTC+2 (CEST) → 06:00 UTC.
      expect(result[0].scheduledDeparture.toISOString()).toBe(
        '2026-04-27T06:00:00.000Z',
      );
    });

    it('expands monday+wednesday+friday across one week into 3 rides', () => {
      // Window: Mon 2026-04-27 → Sun 2026-05-03 (7 days inclusive).
      const result = generateRides(
        {
          ...SHARED,
          tripType: 'recurring',
          schedule: {
            daysOfWeek: {
              ...ALL_DAYS_FALSE,
              monday: true,
              wednesday: true,
              friday: true,
            },
            timeOfDay: '08:00',
          },
          startDate: '2026-04-27',
          endDate: '2026-05-03',
        },
        NOW_BEFORE_FIXTURES,
      );

      expect(result).toHaveLength(3);
      // CEST = UTC+2 across this window, so 08:00 Madrid = 06:00 UTC.
      const isoDates = result.map((r) => r.scheduledDeparture.toISOString());
      expect(isoDates).toEqual([
        '2026-04-27T06:00:00.000Z', // Mon
        '2026-04-29T06:00:00.000Z', // Wed
        '2026-05-01T06:00:00.000Z', // Fri
      ]);
    });

    it('emits unique IDs per generated ride', () => {
      const result = generateRides(
        {
          ...SHARED,
          tripType: 'recurring',
          schedule: { daysOfWeek: ALL_DAYS_TRUE, timeOfDay: '08:00' },
          startDate: '2026-04-27',
          endDate: '2026-05-03',
        },
        NOW_BEFORE_FIXTURES,
      );

      const ids = new Set(result.map((r) => r.id));
      expect(ids.size).toBe(result.length);
    });

    // Note: missing schedule / startDate / endDate are compile errors
    // (discriminated union), not runtime checks. No corresponding tests.

    it('throws when endDate is before startDate (programmer-error guard)', () => {
      expect(() =>
        generateRides(
          {
            ...SHARED,
            tripType: 'recurring',
            schedule: { daysOfWeek: ALL_DAYS_TRUE, timeOfDay: '08:00' },
            startDate: '2026-04-27',
            endDate: '2026-04-26',
          },
          NOW_BEFORE_FIXTURES,
        ),
      ).toThrow(/endDate/);
    });

    it('skips instants at or before `now` when the window straddles it', () => {
      // Window Mon 2026-04-27 → Sun 2026-05-03, M+W+F at 08:00 Madrid.
      // Pin now to Wed 09:00 Madrid (07:00 UTC, after that day's 06:00 UTC
      // departure): Mon and Wed should be skipped, Fri retained.
      const now = new Date('2026-04-29T07:00:00.000Z');
      const result = generateRides(
        {
          ...SHARED,
          tripType: 'recurring',
          schedule: {
            daysOfWeek: {
              ...ALL_DAYS_FALSE,
              monday: true,
              wednesday: true,
              friday: true,
            },
            timeOfDay: '08:00',
          },
          startDate: '2026-04-27',
          endDate: '2026-05-03',
        },
        now,
      );

      const isoDates = result.map((r) => r.scheduledDeparture.toISOString());
      expect(isoDates).toEqual(['2026-05-01T06:00:00.000Z']);
    });

    it('returns an empty array when every matching instant is in the past', () => {
      // Today (Madrid) is Fri 2026-05-01 at 10:00 (08:00 UTC); schedule is
      // M-F at 08:00 with window Mon..Fri. All five days resolve to instants
      // already passed.
      const now = new Date('2026-05-01T08:00:00.000Z');
      const result = generateRides(
        {
          ...SHARED,
          tripType: 'recurring',
          schedule: {
            daysOfWeek: {
              ...ALL_DAYS_FALSE,
              monday: true,
              tuesday: true,
              wednesday: true,
              thursday: true,
              friday: true,
            },
            timeOfDay: '08:00',
          },
          startDate: '2026-04-27',
          endDate: '2026-05-01',
        },
        now,
      );

      expect(result).toEqual([]);
    });

    it('handles the Madrid Spring-forward DST transition at 02:30 across 2025-03-29..31', () => {
      // Madrid switched from CET (UTC+1) to CEST (UTC+2) at
      // 2025-03-30T02:00 local: clocks jumped 02:00 → 03:00, so the
      // wall-clock instant "02:30" on 2025-03-30 does not exist.
      //
      // `date-fns-tz` `fromZonedTime` does not throw for the gap. Empirically
      // it interprets the wall-clock string with the pre-jump offset (UTC+1),
      // yielding the values asserted below. We pin the actual UTC timestamps
      // here so any future libversion change that shifts the gap-resolution
      // strategy fails loudly rather than drifting silently.
      const result = generateRides(
        {
          ...SHARED,
          tripType: 'recurring',
          schedule: { daysOfWeek: ALL_DAYS_TRUE, timeOfDay: '02:30' },
          startDate: '2025-03-29',
          endDate: '2025-03-31',
        },
        new Date('2025-01-01T00:00:00.000Z'),
      );

      expect(result).toHaveLength(3);

      const isoDates = result.map((r) => r.scheduledDeparture.toISOString());
      expect(isoDates).toEqual([
        // 2025-03-29 (Sat): still CET (UTC+1), 02:30 Madrid = 01:30 UTC.
        '2025-03-29T01:30:00.000Z',
        // 2025-03-30 (Sun): DST gap day. fromZonedTime treats "02:30" with
        // the pre-jump offset (UTC+1), giving 00:30 UTC. The "real" Madrid
        // clock at this UTC instant reads 01:30 (still pre-jump); 30 minutes
        // later the jump happens and clocks become 03:00.
        '2025-03-30T00:30:00.000Z',
        // 2025-03-31 (Mon): now CEST (UTC+2), 02:30 Madrid = 00:30 UTC.
        '2025-03-31T00:30:00.000Z',
      ]);
    });
  });
});
