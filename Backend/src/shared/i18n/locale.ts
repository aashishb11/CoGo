import { eq, inArray } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import { profile } from '@core/database/schema';

export const SUPPORTED_LOCALES = ['en', 'es', 'ca'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const FALLBACK_LOCALE: Locale = 'es';

const isSupported = (value: string | null | undefined): value is Locale =>
  value !== null &&
  value !== undefined &&
  (SUPPORTED_LOCALES as readonly string[]).includes(value);

/** Resolves one user's preferred locale. Falls back when the profile has no
 *  locale set or the stored value is outside `SUPPORTED_LOCALES`. */
export async function resolveLocale(
  tx: DbClient,
  userId: string,
): Promise<Locale> {
  const [row] = await tx
    .select({ locale: profile.locale })
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1);
  return isSupported(row?.locale) ? row.locale : FALLBACK_LOCALE;
}

/** Batched variant for fan-out flows (push notifications, bulk emails).
 *  Returned map only contains userIds present in `userIds`; callers should
 *  default missing entries to `FALLBACK_LOCALE`. */
export async function resolveLocalesByUserIds(
  tx: DbClient,
  userIds: string[],
): Promise<Map<string, Locale>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const rows = await tx
    .select({ userId: profile.userId, locale: profile.locale })
    .from(profile)
    .where(inArray(profile.userId, userIds));

  const out = new Map<string, Locale>();
  for (const row of rows) {
    out.set(row.userId, isSupported(row.locale) ? row.locale : FALLBACK_LOCALE);
  }
  return out;
}
