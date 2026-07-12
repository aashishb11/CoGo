import { randomUUID } from 'node:crypto';
import { fromZonedTime } from 'date-fns-tz';
import type { InsertRide } from '@core/database/schema/rides.schema';
import type { DayOfWeek, Location, RecurringSchedule } from '../trips.types';

const TIMEZONE = 'Europe/Madrid';

const WEEKDAY_BY_INDEX: Record<number, DayOfWeek> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

type CommonInput = {
  tripId: string;
  origin: Location;
  destination: Location;
  totalDistanceKm: number;
  seatsOffered: number;
};

export type GenerateRidesInput =
  | (CommonInput & { tripType: 'sporadic'; departureAt: Date })
  | (CommonInput & {
      tripType: 'recurring';
      schedule: RecurringSchedule;
      startDate: string; // 'YYYY-MM-DD'
      endDate: string; // 'YYYY-MM-DD'
    });

/**
 * pre: caller has already computed `totalDistanceKm`.
 * post: returns insert-ready ride rows with fresh UUIDs.
 *
 * Recurring `(date, timeOfDay)` is resolved in `Europe/Madrid`. On a DST
 * forward-jump day the wall-clock instant doesn't exist; `fromZonedTime`
 * resolves it with the pre-jump offset rather than throwing.
 *
 * For recurring trips, instants `<= now` are skipped so historical days in a
 * mid-window create can't produce already-departed rides. The caller is
 * responsible for surfacing the empty-result case to the user.
 */
export function generateRides(
  input: GenerateRidesInput,
  now: Date = new Date(),
): InsertRide[] {
  if (input.tripType === 'sporadic') {
    return [buildRide(input, input.departureAt)];
  }

  // Programmer-error guard; the user-facing check belongs in the DTO.
  const start = parseYmd(input.startDate);
  const end = parseYmd(input.endDate);
  if (end.getTime() < start.getTime()) {
    throw new Error('endDate must be on or after startDate');
  }

  const { daysOfWeek, timeOfDay } = input.schedule;
  const out: InsertRide[] = [];
  const nowMs = now.getTime();

  for (
    let day = start.getTime();
    day <= end.getTime();
    day += 24 * 60 * 60 * 1000
  ) {
    const cursor = new Date(day);
    const weekday = WEEKDAY_BY_INDEX[cursor.getUTCDay()];
    if (!daysOfWeek[weekday]) {
      continue;
    }

    const yyyy = cursor.getUTCFullYear();
    const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getUTCDate()).padStart(2, '0');
    const wallClock = `${yyyy}-${mm}-${dd}T${timeOfDay}:00`;
    const scheduledDeparture = fromZonedTime(wallClock, TIMEZONE);

    if (scheduledDeparture.getTime() <= nowMs) {
      continue;
    }

    out.push(buildRide(input, scheduledDeparture));
  }

  return out;
}

function buildRide(
  input: GenerateRidesInput,
  scheduledDeparture: Date,
): InsertRide {
  return {
    id: randomUUID(),
    tripId: input.tripId,
    scheduledDeparture,
    originLabel: input.origin.label,
    originLat: input.origin.lat,
    originLng: input.origin.lng,
    destinationLabel: input.destination.label,
    destinationLat: input.destination.lat,
    destinationLng: input.destination.lng,
    totalDistanceKm: input.totalDistanceKm,
    seatsOffered: input.seatsOffered,
  };
}

function parseYmd(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid date string: ${value} (expected YYYY-MM-DD)`);
  }
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}
