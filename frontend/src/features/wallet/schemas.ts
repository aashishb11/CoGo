import { z } from 'zod';

// User-facing wallet amounts are entered in euros (decimal). The backend
// expects integer cents on both the top-up and the withdrawal endpoints, so
// the form schema accepts a localized euro string ("12,50" / "12.50") and
// transforms it into integer cents.
//
// Top-up bounds come from the backend's TOPUP_AMOUNT_OUT_OF_RANGE check
// (100..50000 cents → 1.00 € .. 500.00 €). Withdrawal bounds are checked
// here against the user's available balance — the schema-level minimum is
// 1 € (matches the top-up minimum and avoids tiny noise transfers).

const EURO_MIN_CENTS = 100; // 1.00 €
const EURO_MAX_CENTS = 50000; // 500.00 €

function normalizeEuroInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // Accept comma OR dot decimal separator; strip everything else (spaces,
  // currency glyph, thousand separators).
  return raw.replace(/\s+/g, '').replace(',', '.');
}

function parseEuroToCents(raw: unknown): number | null {
  const normalized = normalizeEuroInput(raw);
  if (!normalized) return null;
  // Reject anything that isn't a plain decimal number (no exponents, no
  // negative sign — amounts are always positive credits).
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const euros = Number(normalized);
  if (!Number.isFinite(euros)) return null;
  return Math.round(euros * 100);
}

export const TopUpAmountSchema = z.string().transform((value, ctx) => {
  const cents = parseEuroToCents(value);
  if (cents === null) {
    ctx.addIssue({ code: 'custom', message: 'wallet.amount.invalid' });
    return z.NEVER;
  }
  if (cents < EURO_MIN_CENTS) {
    ctx.addIssue({ code: 'custom', message: 'wallet.amount.tooSmall' });
    return z.NEVER;
  }
  if (cents > EURO_MAX_CENTS) {
    ctx.addIssue({ code: 'custom', message: 'wallet.amount.tooLarge' });
    return z.NEVER;
  }
  return cents;
});

export const TopUpFormSchema = z.object({
  amount: TopUpAmountSchema,
});

export type TopUpFormInput = z.input<typeof TopUpFormSchema>;
export type TopUpFormOutput = z.output<typeof TopUpFormSchema>;

// Withdraw schema is parametrized by the user's available balance so we can
// surface a friendly error rather than letting the backend return
// INSUFFICIENT_WALLET_BALANCE. The same shape as the top-up form.
export function createWithdrawSchema(availableCents: number) {
  return z.object({
    amount: z.string().transform((value, ctx) => {
      const cents = parseEuroToCents(value);
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: 'wallet.amount.invalid' });
        return z.NEVER;
      }
      if (cents < EURO_MIN_CENTS) {
        ctx.addIssue({ code: 'custom', message: 'wallet.amount.tooSmall' });
        return z.NEVER;
      }
      if (cents > availableCents) {
        ctx.addIssue({ code: 'custom', message: 'wallet.amount.exceedsBalance' });
        return z.NEVER;
      }
      return cents;
    }),
  });
}

export type WithdrawFormInput = { amount: string };
export type WithdrawFormOutput = { amount: number };

export const TOP_UP_PRESETS_CENTS = [500, 1000, 2000, 5000, 10000] as const;
