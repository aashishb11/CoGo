import type { TextKey } from '@/shared/i18n';

type ErrorLike = {
  code?: unknown;
  status?: unknown;
  statusText?: unknown;
  message?: unknown;
  error?: unknown;
};

export class ApiError extends Error {
  status?: number;
  code?: string;
  payload?: unknown;

  constructor(message: string, opts: { status?: number; code?: string; payload?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.payload = opts.payload;
  }
}

export function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const directCode = (error as ErrorLike).code;
  if (typeof directCode === 'string') {
    return directCode;
  }

  const nestedError = (error as ErrorLike).error;
  if (nestedError && typeof nestedError === 'object') {
    const nestedCode = (nestedError as ErrorLike).code;
    return typeof nestedCode === 'string' ? nestedCode : undefined;
  }

  return undefined;
}

export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const directStatus = (error as ErrorLike).status;
  if (typeof directStatus === 'number') {
    return directStatus;
  }
  if (typeof directStatus === 'string') {
    const numericStatus = Number(directStatus);
    return Number.isFinite(numericStatus) ? numericStatus : undefined;
  }

  const nestedError = (error as ErrorLike).error;
  if (nestedError && typeof nestedError === 'object') {
    const nestedStatus = (nestedError as ErrorLike).status;
    if (typeof nestedStatus === 'number') {
      return nestedStatus;
    }
    if (typeof nestedStatus === 'string') {
      const numericStatus = Number(nestedStatus);
      return Number.isFinite(numericStatus) ? numericStatus : undefined;
    }
  }

  return undefined;
}

export function getErrorStatusText(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const directStatusText = (error as ErrorLike).statusText;
  if (typeof directStatusText === 'string') {
    return directStatusText;
  }

  const nestedError = (error as ErrorLike).error;
  if (nestedError && typeof nestedError === 'object') {
    const nestedStatusText = (nestedError as ErrorLike).statusText;
    if (typeof nestedStatusText === 'string') {
      return nestedStatusText;
    }
  }

  return '';
}

export function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const directMessage = (error as ErrorLike).message;
  if (typeof directMessage === 'string') {
    return directMessage;
  }

  const nestedError = (error as ErrorLike).error;
  if (nestedError && typeof nestedError === 'object') {
    const nestedMessage = (nestedError as ErrorLike).message;
    if (typeof nestedMessage === 'string') {
      return nestedMessage;
    }
  }

  return '';
}

export function mapErrorToMessageKey(error: unknown): TextKey {
  const status = getErrorStatus(error);
  const code = getErrorCode(error);
  const statusText = getErrorStatusText(error).toLowerCase();
  const message = getErrorMessage(error).toLowerCase();

  // Better-auth's admin plugin returns a banned-user signal when a banned
  // account tries to sign in. Map it before the generic invalid-credentials
  // check so the user gets the actual reason instead of "wrong password".
  if (
    code === 'BANNED_USER' ||
    code === 'USER_BANNED' ||
    code === 'ACCOUNT_BANNED' ||
    /\bbanned\b|user is banned|account is banned/i.test(message)
  ) {
    return 'auth.signIn.error.banned';
  }
  // Better-auth returns 401 for invalid credentials AND for unverified-email
  // sign-in attempts. Check both before the generic 401 → noSession fallback so
  // the UI can show the actual cause instead of a misleading "session" message.
  if (
    code === 'INVALID_EMAIL_OR_PASSWORD' ||
    code === 'INVALID_PASSWORD' ||
    code === 'INVALID_CREDENTIALS' ||
    /invalid (password|credentials|email)/i.test(message)
  ) {
    return 'auth.signIn.error.invalidCredentials';
  }
  if (code === 'EMAIL_NOT_VERIFIED' || /email not verified|not verified/i.test(message)) {
    return 'auth.signIn.error.emailNotVerified';
  }
  if (
    code === 'INVALID_REDIRECT_URL' ||
    code === 'INVALID_CALLBACK_URL' ||
    code === 'INVALID_ORIGIN' ||
    message.includes('invalid redirect') ||
    message.includes('invalid callback') ||
    message.includes('invalid origin')
  ) {
    return 'auth.forgotPassword.error.callback';
  }
  if (code === 'RESET_PASSWORD_DISABLED' || message.includes("reset password isn't enabled")) {
    return 'auth.forgotPassword.error.disabled';
  }
  if (code === 'INVALID_TOKEN' || message.includes('invalid token')) {
    return 'auth.resetPassword.invalidToken';
  }
  if (code === 'PASSWORD_TOO_SHORT' || message.includes('password too short')) {
    return 'auth.password.tooShort';
  }
  // Trip-edit specific backend codes need to win over the generic 400/409
  // status fallthroughs below — the backend ships them with status 400 and
  // they would otherwise bounce to `common.error.validation`.
  if (
    code === 'DESTINATION_OUT_OF_RANGE' ||
    code === 'EXTERNAL_EVENT_DESTINATION_OUT_OF_RANGE' ||
    message.includes('destinationoutofrange') ||
    message.includes('destination out of range') ||
    message.includes('2 km')
  ) {
    return 'createTrip.error.destinationOutOfRange';
  }
  if (code === 'ACTIVE_BOOKINGS_PRESENT') {
    return 'editTrip.error.activeBookings';
  }
  if (code === 'SCHEDULE_FIELDS_IMMUTABLE') {
    return 'editTrip.error.scheduleImmutable';
  }
  if (code === 'SEATS_OCCUPIED_EXCEEDS_OFFERED') {
    return 'editTrip.error.seatsOccupied';
  }
  if (code === 'TRUSTED_CONTACT_REQUIRED') {
    return 'error.trustedContactRequired';
  }
  if (code === 'INCIDENT_WINDOW_CLOSED') {
    return 'safety.incidents.error.windowClosed';
  }
  if (code === 'RIDE_NOT_DEPARTED') {
    return 'error.rideNotDeparted';
  }
  if (code === 'RIDE_ALREADY_STARTED') {
    return 'error.rideAlreadyStarted';
  }
  if (code === 'RIDE_NOT_IN_PROGRESS') {
    return 'error.rideNotInProgress';
  }
  if (code === 'BOARDING_TOKEN_INVALID') {
    return 'error.boardingTokenInvalid';
  }
  if (code === 'BOARDING_ALREADY_RECORDED') {
    return 'error.boardingAlreadyRecorded';
  }
  if (
    status === 409 &&
    (message.includes('active booking already exists') ||
      message.includes('booking already exists') ||
      message.includes('already requested'))
  ) {
    return 'joinTrip.error.alreadyRequested';
  }
  if (
    code === 'RIDE_DEPARTED' ||
    message.includes('ride_departed') ||
    message.includes('scheduleddeparture') ||
    message.includes('scheduled departure') ||
    message.includes('already departed') ||
    message.includes('in the future')
  ) {
    return 'joinTrip.error.rideDeparted';
  }
  if (code === 'RIDE_FULL' || message.includes('ride_full') || message.includes('ride full')) {
    return 'joinTrip.error.rideFull';
  }
  // Wallet-specific backend codes. Status is 400/403 for these so they would
  // otherwise bounce to `common.error.validation` / `auth.signIn.error.noSession`
  // which doesn't read well in the wallet UI. The withdraw screen also handles
  // these inline for tighter copy; the mapping here is the fallback.
  if (code === 'TOPUP_AMOUNT_OUT_OF_RANGE') {
    return 'wallet.amount.tooLarge';
  }
  if (code === 'INSUFFICIENT_WALLET_BALANCE') {
    return 'wallet.withdraw.error.insufficient';
  }
  if (code === 'PAYOUT_ACCOUNT_NOT_READY') {
    return 'wallet.withdraw.error.notReady';
  }
  // Safety / incident reporting codes — surfaced from the report-incident
  // sheet and the my-incidents flow. Need to win over the generic 400/403
  // fallthroughs below.
  if (code === 'INCIDENT_WINDOW_CLOSED') {
    return 'safety.incidents.error.windowClosed';
  }
  if (code === 'TRUSTED_CONTACT_REQUIRED') {
    return 'error.trustedContactRequired';
  }
  if (
    message.includes('cannot book') ||
    message.includes('own ride') ||
    message.includes('own trip') ||
    message.includes('driver of the trip')
  ) {
    return 'joinTrip.error.ownTrip';
  }
  // 400/422 from the backend's ValidationPipe (DTO mismatch / forbidden fields).
  // Surfaces real causes like the Add Vehicle schema mismatch instead of
  // bouncing them to "unexpected error".
  if (status === 400 || status === 422 || code === 'VALIDATION') {
    return 'common.error.validation';
  }
  if (status === 401 || status === 403) {
    return 'auth.signIn.error.noSession';
  }
  if (status === 429 || code === 'TOO_MANY_REQUESTS' || message.includes('too many requests')) {
    return 'auth.signIn.error.tooManyRequests';
  }
  if (code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
    return 'auth.signUp.error.emailTaken';
  }
  if (
    error instanceof TypeError ||
    message.includes('network') ||
    statusText.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('fetch failed')
  ) {
    return 'common.error.network';
  }

  return 'common.error.unknown';
}
