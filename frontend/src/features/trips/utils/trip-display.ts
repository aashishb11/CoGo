import { type DriverTripDto } from '@/features/trips/api';
import { type Lang } from '@/shared/i18n';

export const WEEKDAYS: Record<Lang, string[]> = {
  es: ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ca: ['Dg', 'Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds'],
};

export function normalizePointLabel(point: DriverTripDto['origin'] | DriverTripDto['destination']) {
  if (typeof point === 'string' && point.trim().length > 0) return point.trim();
  if (point && typeof point === 'object') {
    const label = (point as { label?: unknown }).label;
    if (typeof label === 'string' && label.trim().length > 0) return label.trim();
  }
  return '-';
}

export function normalizeTripTime(trip: DriverTripDto) {
  const schedule = trip.schedule as
    | { timeOfDay?: unknown; departureTime?: unknown; departure_time?: unknown }
    | null
    | undefined;
  if (typeof schedule?.timeOfDay === 'string' && schedule.timeOfDay.trim()) {
    return schedule.timeOfDay.trim();
  }
  if (typeof schedule?.departureTime === 'string' && schedule.departureTime.trim()) {
    return schedule.departureTime.trim();
  }
  if (typeof schedule?.departure_time === 'string' && schedule.departure_time.trim()) {
    return schedule.departure_time.trim();
  }
  if (typeof trip.departureAt === 'string' && trip.departureAt.trim()) {
    const date = new Date(trip.departureAt);
    if (!Number.isNaN(date.getTime())) {
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
  }
  return '--:--';
}

export function isRecurringTrip(trip: DriverTripDto) {
  if (trip.type === 'sporadic') return false;
  if (trip.type === 'recurring') return true;
  const rawSchedule = trip.schedule as { daysOfWeek?: unknown; days?: unknown } | null | undefined;
  const scheduleDays = rawSchedule?.daysOfWeek ?? rawSchedule?.days;
  return Boolean(scheduleDays && typeof scheduleDays === 'object');
}

export function recurringWeekdayDots(trip: DriverTripDto, lang: Lang): string {
  const rawSchedule = trip.schedule as { daysOfWeek?: unknown; days?: unknown } | null | undefined;
  const scheduleDays = rawSchedule?.daysOfWeek ?? rawSchedule?.days;
  const selected: number[] = [];
  if (scheduleDays && typeof scheduleDays === 'object') {
    const d = scheduleDays as Record<string, unknown>;
    if (d.sunday === true) selected.push(0);
    if (d.monday === true) selected.push(1);
    if (d.tuesday === true) selected.push(2);
    if (d.wednesday === true) selected.push(3);
    if (d.thursday === true) selected.push(4);
    if (d.friday === true) selected.push(5);
    if (d.saturday === true) selected.push(6);
  } else if (Array.isArray(trip.days)) {
    selected.push(
      ...trip.days.filter((v): v is number => typeof v === 'number' && v >= 0 && v <= 6),
    );
  }
  if (selected.length === 0) return '';
  return selected
    .sort((a, b) => a - b)
    .map((i) => WEEKDAYS[lang][i])
    .join(' · ')
    .toUpperCase();
}

export function formatOneTimeDate(trip: DriverTripDto, lang: Lang): string {
  if (typeof trip.departureAt !== 'string') return '';
  const date = new Date(trip.departureAt);
  if (Number.isNaN(date.getTime())) return '';
  const localeMap: Record<Lang, string> = { en: 'en-US', es: 'es-ES', ca: 'ca-ES' };
  try {
    return new Intl.DateTimeFormat(localeMap[lang], { day: 'numeric', month: 'short' })
      .format(date)
      .toUpperCase();
  } catch {
    return WEEKDAYS[lang][date.getDay()].toUpperCase();
  }
}

export function normalizeSeats(trip: DriverTripDto) {
  if (typeof trip.seatsAvailable === 'number') return trip.seatsAvailable;
  if (typeof trip.seatsOffered === 'number') return trip.seatsOffered;
  return null;
}
