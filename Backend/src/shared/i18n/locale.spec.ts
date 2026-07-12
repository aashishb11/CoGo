/* eslint-disable @typescript-eslint/unbound-method */
import type { DbClient } from '@core/database/database.module';
import {
  FALLBACK_LOCALE,
  resolveLocale,
  resolveLocalesByUserIds,
} from './locale';

type LocaleRow = { userId?: string; locale: string | null };

const mkTxReturning = (rows: LocaleRow[]) => {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
    then: (resolve: (value: LocaleRow[]) => unknown) => resolve(rows),
  };
  return {
    select: jest.fn().mockReturnValue(chain),
  } as unknown as DbClient;
};

describe('resolveLocale', () => {
  it('returns the stored locale when it is in the supported set', async () => {
    const tx = mkTxReturning([{ locale: 'en' }]);

    await expect(resolveLocale(tx, 'u1')).resolves.toBe('en');
  });

  it('falls back when the user has no profile row', async () => {
    const tx = mkTxReturning([]);

    await expect(resolveLocale(tx, 'u1')).resolves.toBe(FALLBACK_LOCALE);
  });

  it('falls back when the stored locale is null', async () => {
    const tx = mkTxReturning([{ locale: null }]);

    await expect(resolveLocale(tx, 'u1')).resolves.toBe(FALLBACK_LOCALE);
  });

  it('falls back when the stored locale is outside the supported set', async () => {
    const tx = mkTxReturning([{ locale: 'fr' }]);

    await expect(resolveLocale(tx, 'u1')).resolves.toBe(FALLBACK_LOCALE);
  });
});

describe('resolveLocalesByUserIds', () => {
  it('returns an empty map when the input list is empty without hitting the DB', async () => {
    const tx = mkTxReturning([{ locale: 'en' }]);

    const result = await resolveLocalesByUserIds(tx, []);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(tx.select).not.toHaveBeenCalled();
  });

  it('maps each returned user to their supported locale', async () => {
    const tx = mkTxReturning([
      { userId: 'u1', locale: 'en' },
      { userId: 'u2', locale: 'ca' },
    ]);

    const result = await resolveLocalesByUserIds(tx, ['u1', 'u2']);

    expect(result.get('u1')).toBe('en');
    expect(result.get('u2')).toBe('ca');
  });

  it('replaces unsupported locales in the row set with the fallback', async () => {
    const tx = mkTxReturning([
      { userId: 'u1', locale: null },
      { userId: 'u2', locale: 'fr' },
    ]);

    const result = await resolveLocalesByUserIds(tx, ['u1', 'u2']);

    expect(result.get('u1')).toBe(FALLBACK_LOCALE);
    expect(result.get('u2')).toBe(FALLBACK_LOCALE);
  });

  it('omits userIds that have no row (caller must default to fallback)', async () => {
    const tx = mkTxReturning([{ userId: 'u1', locale: 'es' }]);

    const result = await resolveLocalesByUserIds(tx, ['u1', 'u_missing']);

    expect(result.get('u1')).toBe('es');
    expect(result.has('u_missing')).toBe(false);
  });
});
