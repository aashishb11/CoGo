import type { Lang } from '@/shared/i18n';

const LOCALE_MAP: Record<Lang, string> = {
  en: 'en-IE',
  es: 'es-ES',
  ca: 'ca-ES',
};

// Format an integer cent amount as a localized EUR string. The sign is
// preserved so debits/credits read naturally in the transactions list. We use
// `signDisplay: 'never'` and inject the sign separately so the layout matches
// the mockups (e.g. `+€12,00` / `−€5,00`).
export function formatCents(cents: number, lang: Lang): string {
  const locale = LOCALE_MAP[lang] ?? 'en-IE';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'never',
    }).format(Math.abs(cents) / 100);
  } catch {
    // Fallback for runtimes where Intl is partially missing (RN web, older
    // Hermes). The plain string keeps the screen functional.
    return `${(Math.abs(cents) / 100).toFixed(2)} €`;
  }
}

// Returns a leading sign character matching the convention used by the
// transactions list. Zero is treated as unsigned.
export function signFor(cents: number): '+' | '−' | '' {
  if (cents > 0) return '+';
  if (cents < 0) return '−';
  return '';
}

// Render a delta amount with the sign baked in ("+€12,00", "−€5,00", "€0,00").
export function formatSignedCents(cents: number, lang: Lang): string {
  const base = formatCents(cents, lang);
  const sign = signFor(cents);
  return sign ? `${sign}${base}` : base;
}
