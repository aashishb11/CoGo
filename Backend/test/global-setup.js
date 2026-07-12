module.exports = async () => {
  require('dotenv').config();
  process.env.BETTER_AUTH_URL ||= 'http://localhost:3000';
  process.env.BETTER_AUTH_SECRET ||= 'test-better-auth-secret';
  process.env.BREVO_API_KEY ||= 'test-brevo-api-key';
  process.env.BREVO_API_URL ||= 'https://api.brevo.com/v3/smtp/email';
  process.env.MAIL_FROM_EMAIL ||= 'test@example.com';
  process.env.MAIL_FROM_NAME ||= 'CoGo';
  process.env.CULTUCAT_API_BASE_URL ||= 'https://cultucat.test';
  process.env.CULTUCAT_EVENTS_PATH ||= '/external/events';
  process.env.CULTUCAT_API_KEY ||= 'test-cultucat-api-key';
  process.env.CULTUCAT_TIMEOUT_MS ||= '5000';
  process.env.CULTUCAT_EVENT_MAX_DISTANCE_KM ||= '2';
  process.env.GOOGLE_CLIENT_ID ||= 'test-google-client-id';
  process.env.GOOGLE_CLIENT_SECRET ||= 'test-google-client-secret';
  process.env.TOMTOM_API_KEY ||= 'test-tomtom-api-key';
  process.env.VAPID_PUBLIC_KEY ||= 'test-vapid-public-key';
  process.env.VAPID_PRIVATE_KEY ||= 'test-vapid-private-key';
  process.env.VAPID_SUBJECT ||= 'mailto:test@example.com';
  // Assigned unconditionally: partner e2e tests authenticate with this exact
  // value, so a real PARTNER_API_KEY in a developer's .env must not shadow it.
  process.env.PARTNER_API_KEY = 'test-partner-api-key';
  // Stripe — fixed test values so signed-webhook fixtures and the SDK stub
  // resolve the same secrets. A real STRIPE_* in a developer's .env must
  // not shadow these.
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_payments';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test_connect';
  process.env.WALLET_RETURN_URL ||= 'cogo://wallet';
  process.env.CONNECT_RETURN_URL ||= 'cogo://wallet/payout-account';
  process.env.CONNECT_REFRESH_URL ||= 'cogo://wallet/payout-account?refresh=1';
  process.env.BOARDING_TOKEN_SECRET ||= 'test-boarding-token-secret-32bytes';
};
