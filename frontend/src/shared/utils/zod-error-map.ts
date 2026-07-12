import i18n, { type TextKey } from '@/shared/i18n';

// Maps the literal `message` slugs used by our Zod schemas (and the default
// codes Zod emits for built-in checks) onto the existing i18n keys so that
// `react-hook-form` can surface a translated error string under each field.

const SLUG_TO_KEY: Record<string, TextKey> = {
  password_required: 'auth.password.required',
  invalid_phone: 'auth.createProfile.phone.invalid',
  invalid_locale: 'auth.createProfile.locale.invalid',
  invalid_plate: 'manageCars.form.plate.invalid',
  invalid_time: 'manageCars.form.plate.invalid', // reused — no dedicated key yet
  passwords_do_not_match: 'auth.password.match',
  'admin.org.create.name.required': 'admin.org.create.name.required',
  'admin.org.create.domain.invalid': 'admin.org.create.domain.invalid',
  'wallet.amount.invalid': 'wallet.amount.invalid',
  'wallet.amount.tooSmall': 'wallet.amount.tooSmall',
  'wallet.amount.tooLarge': 'wallet.amount.tooLarge',
  'wallet.amount.exceedsBalance': 'wallet.amount.exceedsBalance',
};

// Translate a Zod-emitted message into a localized string. Falls back to the
// raw message if no mapping exists, so the underlying validation slug remains
// visible during development if a key is missing.
export function translateZodMessage(message: string | undefined): string {
  if (!message) {
    return '';
  }

  const mapped = SLUG_TO_KEY[message];
  if (mapped) {
    return i18n.t(mapped);
  }

  if (message.toLowerCase().includes('email')) {
    return i18n.t('auth.email.invalid');
  }
  if (
    message === 'Required' ||
    message === 'String must contain at least 1 character(s)' ||
    message === 'Too small: expected string to have >=1 characters'
  ) {
    return i18n.t('auth.email.required');
  }

  return message;
}
