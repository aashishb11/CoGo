import { createHmac, timingSafeEqual } from 'node:crypto';

// 30s rotation window — short enough that a leaked QR is useless quickly,
// long enough that a passenger's screen-refresh / driver's scan cycle
// fits comfortably. Exposed for tests; do not import this from other
// modules.
export const BOARDING_TOKEN_WINDOW_MS = 30 * 1000;

// Accept tokens from the immediately-previous window too, so a token
// captured at the very tail of one window still verifies if the scan
// lands in the next one. Increasing this past 1 slot would loosen the
// "rotates every 30s" guarantee — keep it at 1.
const ACCEPTED_WINDOW_SKEW = 1;

/**
 * Pure HMAC-signed `{ bookingId, window }` token. Stateless: the only
 * thing tying a token back to a real booking is the secret. Window
 * rotation makes any leaked QR worthless within ~30s; replay across
 * boardings is blocked by `bookings.boarded_at`, not by us.
 */
export type BoardingTokenPayload = {
  bookingId: string;
  /** Integer slot index: `floor(now / WINDOW)`. */
  window: number;
};

/**
 * Returns the integer window slot for `now` (defaults to `Date.now()`).
 * Exported for the controller — the response surface includes
 * `validUntil` so the FE can refresh proactively.
 */
export function windowFor(now: number = Date.now()): number {
  return Math.floor(now / BOARDING_TOKEN_WINDOW_MS);
}

/**
 * End (exclusive) of the window slot — convenient for surfacing a
 * `validUntil` to the FE.
 */
export function windowEnd(window: number): Date {
  return new Date((window + 1) * BOARDING_TOKEN_WINDOW_MS);
}

/** Returns a base64url-encoded `<payload>.<signature>` string. */
export function signBoardingToken(
  payload: BoardingTokenPayload,
  secret: string,
): string {
  const body = `${payload.bookingId}|${payload.window}`;
  const signature = createHmac('sha256', secret).update(body).digest();
  const sigB64 = base64UrlEncode(signature);
  const payloadB64 = base64UrlEncode(Buffer.from(body, 'utf8'));
  return `${payloadB64}.${sigB64}`;
}

export type VerifyOptions = { now?: number; secret: string };

/**
 * Verifies the token signature, decodes the payload, and rejects tokens
 * whose `window` is outside the accepted skew of the current window.
 * Returns the payload on success, or `null` on any failure (invalid
 * encoding, bad signature, expired, etc.). Callers translate `null` to
 * `BOARDING_TOKEN_INVALID`.
 */
export function verifyBoardingToken(
  token: string,
  options: VerifyOptions,
): BoardingTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  let bodyBytes: Buffer;
  let sigBytes: Buffer;
  try {
    bodyBytes = base64UrlDecode(payloadB64);
    sigBytes = base64UrlDecode(sigB64);
  } catch {
    return null;
  }

  const expected = createHmac('sha256', options.secret)
    .update(bodyBytes)
    .digest();
  if (expected.length !== sigBytes.length) return null;
  if (!timingSafeEqual(expected, sigBytes)) return null;

  const body = bodyBytes.toString('utf8');
  const sep = body.lastIndexOf('|');
  if (sep === -1) return null;
  const bookingId = body.slice(0, sep);
  const windowRaw = body.slice(sep + 1);
  if (!bookingId || !windowRaw) return null;
  const windowNum = Number.parseInt(windowRaw, 10);
  if (!Number.isInteger(windowNum)) return null;

  const currentWindow = windowFor(options.now);
  const drift = currentWindow - windowNum;
  if (drift < -ACCEPTED_WINDOW_SKEW || drift > ACCEPTED_WINDOW_SKEW) {
    return null;
  }
  return { bookingId, window: windowNum };
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(s: string): Buffer {
  const padded = s
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(s.length + ((4 - (s.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}
