/**
 * Fires every branded transactional email to a target inbox so you can
 * eyeball the rendered HTML across clients (Gmail web, Apple Mail, Outlook).
 *
 * Usage:
 *   pnpm exec ts-node -r tsconfig-paths/register scripts/send-test-emails.ts gaesca04@gmail.com
 *   pnpm exec ts-node -r tsconfig-paths/register scripts/send-test-emails.ts gaesca04@gmail.com en
 *
 * Args:
 *   1. target email (required)
 *   2. locale: en | es | ca (optional, default `es`)
 *
 * Reads BREVO_API_KEY, BREVO_API_URL, MAIL_FROM_*, and BETTER_AUTH_URL
 * from .env. Bypasses MailService / DB / locale resolution — calls the
 * renderers directly so it has zero NestJS surface area.
 */
import 'dotenv/config';
import { SUPPORTED_LOCALES, type Locale } from '../src/shared/i18n/locale';
import type { Brand } from '../src/integrations/mail/templates/layout';
import { renderVerification } from '../src/integrations/mail/templates/verification';
import { renderResetPassword } from '../src/integrations/mail/templates/reset-password';
import { renderIncidentAlert } from '../src/integrations/mail/templates/incident-alert';

const targetEmail = process.argv[2];
const localeArg = (process.argv[3] ?? 'es') as Locale;

if (!targetEmail) {
  console.error('usage: send-test-emails.ts <target-email> [locale]');
  process.exit(1);
}
if (!SUPPORTED_LOCALES.includes(localeArg)) {
  console.error(`locale must be one of ${SUPPORTED_LOCALES.join(', ')}`);
  process.exit(1);
}

const envOrThrow = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
};

const brand: Brand = {
  productName: envOrThrow('MAIL_FROM_NAME'),
  supportEmail: envOrThrow('MAIL_FROM_EMAIL'),
  logoUrl: `${envOrThrow('BETTER_AUTH_URL').replace(/\/$/, '')}/static/cogo-logo.png`,
};

async function postToBrevo(subject: string, html: string): Promise<void> {
  const response = await fetch(
    process.env.BREVO_API_URL ?? 'https://api.brevo.com/v3/smtp/email',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': envOrThrow('BREVO_API_KEY'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: brand.productName, email: brand.supportEmail },
        to: [{ email: targetEmail }],
        subject: `[test] ${subject}`,
        htmlContent: html,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Brevo ${response.status}: ${await response.text()}`);
  }
}

async function main(): Promise<void> {
  const verification = renderVerification(localeArg, {
    brand,
    url: 'https://cogo-backend.onrender.com/api/auth/verify-email?token=demo',
  });
  await postToBrevo(verification.subject, verification.html);
  console.log(`✓ verification (${localeArg}) sent to ${targetEmail}`);

  const reset = renderResetPassword(localeArg, {
    brand,
    url: 'https://cogo-backend.onrender.com/api/auth/reset-password?token=demo',
  });
  await postToBrevo(reset.subject, reset.html);
  console.log(`✓ reset-password (${localeArg}) sent to ${targetEmail}`);

  const incident = renderIncidentAlert(localeArg, {
    brand,
    payload: {
      reporterId: '00000000-0000-0000-0000-000000000001',
      reporterName: 'Anna García',
      reporterRole: 'passenger',
      category: 'unsafe_driving',
      note: 'The driver was using the phone repeatedly during the trip.',
      trustedContact: { name: 'Test Contact', email: targetEmail },
      ride: {
        rideId: '00000000-0000-0000-0000-000000000099',
        tripId: '00000000-0000-0000-0000-000000000088',
        originLabel: 'Barcelona (Plaça Catalunya)',
        destinationLabel: 'Girona (Estació)',
        scheduledDeparture: new Date('2026-05-26T08:30:00Z'),
        driverId: '00000000-0000-0000-0000-000000000002',
        driverName: 'Joan Martí',
        carModelBrand: 'Volkswagen',
        carModelName: 'Golf',
        carPlate: '1234-ABC',
      },
      acceptedPassengers: [],
    },
  });
  await postToBrevo(incident.subject, incident.html);
  console.log(`✓ incident-alert (${localeArg}) sent to ${targetEmail}`);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
