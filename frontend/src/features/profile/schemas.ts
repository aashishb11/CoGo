import { z } from 'zod';

import { SUPPORTED_LANGS } from '@/shared/i18n';
import { NonEmptyTrimmedString, PhoneSchema } from '@/shared/schemas/common';

// The old `createUserProfile` only set `bio` / `phone` on the POST body when
// their trimmed value was non-empty. We reproduce that by transforming empty
// strings / whitespace-only values to `undefined` *before* piping into
// `PhoneSchema.optional()`, otherwise Zod would try to regex-validate `""`.
export const CreateProfileSchema = z.object({
  username: NonEmptyTrimmedString,
  bio: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .pipe(PhoneSchema.optional()),
  locale: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .pipe(z.enum(SUPPORTED_LANGS, { message: 'invalid_locale' }).optional()),
});
export type CreateProfileInput = z.infer<typeof CreateProfileSchema>;

export const TrustedContactSchema = z.object({
  name: NonEmptyTrimmedString,
  email: z.string().trim().email({ message: 'invalid_email' }),
});
export type TrustedContactInput = z.infer<typeof TrustedContactSchema>;
