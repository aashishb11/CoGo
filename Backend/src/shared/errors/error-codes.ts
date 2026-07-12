export const ERROR_CODES = [
  // Status defaults — applied by the global filter when a thrown HttpException
  // body has no explicit `code` field.
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'BAD_GATEWAY',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
  // Validation
  'VALIDATION_FAILED',
  // Domain
  'CAR_NOT_OWNED',
  'CAR_HAS_ACTIVE_TRIPS',
  'SCHEDULE_FIELDS_IMMUTABLE',
  'NO_FUTURE_RIDES_IN_WINDOW',
  'RIDE_NOT_DEPARTED',
  'SEATS_OCCUPIED_EXCEEDS_OFFERED',
  'ACTIVE_BOOKINGS_PRESENT',
  'CAR_MODEL_MISSING',
  'CULTUCAT_EVENT_NOT_FOUND',
  'INVALID_EMAIL_FORMAT',
  'ORGANIZATION_DOMAIN_CONFLICT',
  'ORGANIZATION_DOMAIN_EXISTS',
  // Booking batch outcomes — same translation surface as exceptions, surfaced
  // per-item inside `BookingsBatchOutcomeDto.skipped`.
  'RIDE_FULL',
  'RIDE_DEPARTED',
  'ALREADY_TERMINAL',
  // Chat
  'CHAT_THREAD_NOT_FOUND',
  'CHAT_MESSAGE_NOT_FOUND',
  'CHAT_NOT_PARTICIPANT',
  'CHAT_TRIP_NOT_ACTIVE',
  'CHAT_RIDE_WRONG_TRIP',
  'CHAT_DELETE_NOT_SENDER',
  // Wallet
  'TOPUP_AMOUNT_OUT_OF_RANGE',
  'INSUFFICIENT_WALLET_BALANCE',
  'PAYOUT_ACCOUNT_NOT_READY',
  // Safety / ride lifecycle
  'TRUSTED_CONTACT_REQUIRED',
  'BOARDING_TOKEN_INVALID',
  'BOARDING_ALREADY_RECORDED',
  'RIDE_NOT_IN_PROGRESS',
  'RIDE_ALREADY_STARTED',
  'INCIDENT_WINDOW_CLOSED',
  // Ratings (US-07/08/09)
  'RATING_NOT_ELIGIBLE',
  'RATING_ALREADY_SUBMITTED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// `satisfies readonly ErrorCode[]` makes TS fail compilation if any skip
// reason ever drops out of `ERROR_CODES`.
export const BOOKING_SKIP_REASONS = [
  'RIDE_FULL',
  'RIDE_DEPARTED',
  'ALREADY_TERMINAL',
  'INSUFFICIENT_WALLET_BALANCE',
] as const satisfies readonly ErrorCode[];

export type BookingSkipReason = (typeof BOOKING_SKIP_REASONS)[number];
