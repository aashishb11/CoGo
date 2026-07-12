import Joi from 'joi';
import {
  DEFAULT_CULTUCAT_EVENT_MAX_DISTANCE_KM,
  DEFAULT_CULTUCAT_TIMEOUT_MS,
} from '@shared/external-events/cultucat.constants';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  BETTER_AUTH_URL: Joi.string().uri().required(),
  BETTER_AUTH_SECRET: Joi.string().required(),
  BREVO_API_KEY: Joi.string().required(),
  BREVO_API_URL: Joi.string()
    .uri()
    .default('https://api.brevo.com/v3/smtp/email'),
  MAIL_FROM_EMAIL: Joi.string().email().required(),
  MAIL_FROM_NAME: Joi.string().required(),
  CULTUCAT_API_BASE_URL: Joi.string().uri().required(),
  CULTUCAT_EVENTS_PATH: Joi.string().default('/external/events'),
  CULTUCAT_API_KEY: Joi.string().required(),
  CULTUCAT_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1)
    .default(DEFAULT_CULTUCAT_TIMEOUT_MS),
  CULTUCAT_EVENT_MAX_DISTANCE_KM: Joi.number()
    .positive()
    .default(DEFAULT_CULTUCAT_EVENT_MAX_DISTANCE_KM),
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  TOMTOM_API_KEY: Joi.string().required(),
  // Dev/demo override: when set, TrafficService returns this value instead of
  // calling TomTom. Useful for end-to-end testing the watcher → push pipeline
  // without depending on real-world congestion. Unset in production.
  TOMTOM_FAKE_DELAY_SECONDS: Joi.number().integer().min(0).optional(),
  VAPID_PUBLIC_KEY: Joi.string().required(),
  VAPID_PRIVATE_KEY: Joi.string().required(),
  VAPID_SUBJECT: Joi.string().required(),
  // Optional Expo access token used to authenticate pushes sent to native
  // (RN/Expo) clients via the Expo push service. Web Push uses the VAPID keys
  // above; native clients register an Expo push token as their endpoint and are
  // routed to Expo instead. Unset is allowed — Expo accepts unauthenticated
  // sends, but a token is recommended for production.
  EXPO_ACCESS_TOKEN: Joi.string().optional(),
  // Shared secret authenticating the external partner API (/api/partner/v1).
  PARTNER_API_KEY: Joi.string().required(),
  // Stripe — test mode end-to-end. STRIPE_SECRET_KEY drives the SDK; the two
  // webhook secrets verify the signature on the two webhook endpoints
  // (payments scope and connect scope respectively). Return URLs are Expo
  // deep links Stripe bounces the user back to after Checkout / Connect
  // onboarding.
  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
  STRIPE_CONNECT_WEBHOOK_SECRET: Joi.string().required(),
  WALLET_RETURN_URL: Joi.string().uri({ allowRelative: false }).required(),
  CONNECT_RETURN_URL: Joi.string().uri({ allowRelative: false }).required(),
  CONNECT_REFRESH_URL: Joi.string().uri({ allowRelative: false }).required(),
  // HMAC secret used to sign boarding QR tokens (US-03). Tokens are
  // stateless (`{ bookingId, window }`); the secret is the only thing
  // preventing forgery. Generate with `openssl rand -hex 32`.
  BOARDING_TOKEN_SECRET: Joi.string().min(16).required(),
  // When `true`, enables `POST /dev/traffic-alert` for the final-presentation
  // demo. Unset (or anything other than `true`) makes the endpoint return 403.
  DEMO_MODE: Joi.string().valid('true', 'false').optional(),
});
