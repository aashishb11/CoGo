import type { AgendaItem } from '@/features/trips/api';
import type { Lang } from '@/shared/i18n';

const LOCALE_MAP: Record<Lang, string> = {
  en: 'en-US',
  es: 'es-ES',
  ca: 'ca-ES',
};

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Local YYYY-MM-DD. Avoid `iso.slice(0,10)` — that is the UTC date and drifts
// ±1 day for users in non-UTC zones whose rides land near midnight.
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildDateStrip(today: Date, count = 30): Date[] {
  const start = startOfLocalDay(today);
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    out.push(addDays(start, i));
  }
  return out;
}

export function formatTimeHHmm(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatDayHeader(d: Date, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(LOCALE_MAP[lang], {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return d.toDateString();
  }
}

export function formatWeekdayLetter(d: Date, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(LOCALE_MAP[lang], { weekday: 'narrow' }).format(d).toUpperCase();
  } catch {
    return d.toDateString().slice(0, 1).toUpperCase();
  }
}

export function groupAgendaByLocalDay(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const map = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const date = new Date(item.scheduledDeparture);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  for (const bucket of map.values()) {
    bucket.sort(
      (a, b) => new Date(a.scheduledDeparture).getTime() - new Date(b.scheduledDeparture).getTime(),
    );
  }
  return map;
}
