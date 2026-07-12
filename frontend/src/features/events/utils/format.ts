import { type Lang } from '@/shared/i18n';

const LOCALE_MAP: Record<Lang, string> = {
  en: 'en-US',
  es: 'es-ES',
  ca: 'ca-ES',
};

// CultuCat event start/end dates are date-only (always midnight local). The
// real timing lives in the free-text `schedule` field. Never render hour/min.
export function formatEventDate(value: string | null | undefined, lang: Lang): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(LOCALE_MAP[lang], {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return '';
  }
}

export function formatEventDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  lang: Lang,
): string {
  const from = formatEventDate(start, lang);
  if (!end || end === start) return from;
  const to = formatEventDate(end, lang);
  if (!from) return to;
  if (!to) return from;
  return `${from} → ${to}`;
}

export function formatDistanceKm(km: number | null | undefined, lang: Lang): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '';
  try {
    return new Intl.NumberFormat(LOCALE_MAP[lang], {
      maximumFractionDigits: km < 10 ? 1 : 0,
    }).format(km);
  } catch {
    return String(Math.round(km));
  }
}
