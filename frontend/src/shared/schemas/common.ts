import { z } from 'zod';

// Shared primitive schemas for validation and normalization. Phase 2 centralizes
// the logic that previously lived in ad-hoc helpers like `normalizePlate`,
// `normalizeTime`, and inline regex checks scattered across screens and
// `lib/api/*`. Schemas return normalized values (trimmed, padded, reformatted)
// and throw `ZodError` on invalid input — the endpoint wrappers in `lib/api/*`
// convert that into `ApiError('VALIDATION')`.

export const EmailSchema = z.string().trim().toLowerCase().email();

export const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,18}$/, { message: 'invalid_phone' });

// Login only requires a non-empty password; signup has no explicit length
// check in the current `validateForm` (the length hint is commented out),
// so `PasswordSchema` only enforces non-emptiness to stay behaviorally
// identical to today. Phase 4 can tighten this once RHF moves validation
// to the form layer.
export const PasswordSchema = z.string().min(1, { message: 'password_required' });

// Matches the original `normalizePlate` behavior from `lib/cars-api.ts`:
//   1. uppercase the value
//   2. strip whitespace and hyphens to obtain a compact form
//   3. require exactly 4 digits followed by 3 letters
//   4. reformat as `NNNN-LLL`
// Unlike the old helper, this schema throws on invalid input instead of
// soft-failing. The form screens still run `validateForm` first, so invalid
// input does not reach the endpoint in normal flows.
export const PlateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{4}[A-Z]{3}$/, { message: 'invalid_plate' }))
  .transform((compact) => `${compact.slice(0, 4)}-${compact.slice(4)}`);

// Matches the original `normalizeTime` behavior from `lib/trips-api.ts`:
// validate `HH:MM` (24-hour clock) and left-pad single-digit hours to 2
// characters. The old helper soft-failed to `'09:00'` on invalid input;
// this schema throws instead. Same rationale as `PlateSchema`.
export const TimeSchema = z
  .string()
  .regex(/^([01]?\d|2[0-3]):([0-5]\d)$/, { message: 'invalid_time' })
  .transform((s) => {
    const [h, m] = s.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  });

export const NonEmptyTrimmedString = z.string().trim().min(1);
