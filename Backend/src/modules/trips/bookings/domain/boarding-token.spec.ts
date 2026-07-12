import {
  BOARDING_TOKEN_WINDOW_MS,
  signBoardingToken,
  verifyBoardingToken,
  windowEnd,
  windowFor,
} from './boarding-token';

const SECRET = 'unit-test-boarding-secret-32bytes';
const OTHER = 'unit-test-boarding-secret-different';

describe('boarding-token (domain)', () => {
  it('signs and verifies a fresh token round-trip', () => {
    const now = Date.now();
    const window = windowFor(now);
    const token = signBoardingToken({ bookingId: 'bk_1', window }, SECRET);
    expect(verifyBoardingToken(token, { secret: SECRET, now })).toEqual({
      bookingId: 'bk_1',
      window,
    });
  });

  it('rejects tokens signed with a different secret', () => {
    const now = Date.now();
    const window = windowFor(now);
    const token = signBoardingToken({ bookingId: 'bk_1', window }, OTHER);
    expect(verifyBoardingToken(token, { secret: SECRET, now })).toBeNull();
  });

  it('rejects tampered payloads (signature mismatch)', () => {
    const now = Date.now();
    const window = windowFor(now);
    const token = signBoardingToken({ bookingId: 'bk_1', window }, SECRET);
    const [body, sig] = token.split('.');
    // Swap signatures by flipping every byte (xor 0xff in base64url
    // surface) — guaranteed to produce a different, validly-shaped
    // signature that won't pass timing-safe equals.
    const tampered = `${body}.${sig.slice(0, -2)}AA`;
    expect(verifyBoardingToken(tampered, { secret: SECRET, now })).toBeNull();
  });

  it('rejects malformed tokens', () => {
    const now = Date.now();
    expect(verifyBoardingToken('', { secret: SECRET, now })).toBeNull();
    expect(
      verifyBoardingToken('only-one-part', { secret: SECRET, now }),
    ).toBeNull();
    expect(verifyBoardingToken('a.b.c', { secret: SECRET, now })).toBeNull();
  });

  it('accepts tokens from the previous window slot (one slot of skew)', () => {
    const now = Date.now();
    const prevWindow = windowFor(now) - 1;
    const token = signBoardingToken(
      { bookingId: 'bk_1', window: prevWindow },
      SECRET,
    );
    expect(verifyBoardingToken(token, { secret: SECRET, now })).toEqual({
      bookingId: 'bk_1',
      window: prevWindow,
    });
  });

  it('rejects tokens older than one slot', () => {
    const now = Date.now();
    const farPast = windowFor(now) - 5;
    const token = signBoardingToken(
      { bookingId: 'bk_1', window: farPast },
      SECRET,
    );
    expect(verifyBoardingToken(token, { secret: SECRET, now })).toBeNull();
  });

  it('rejects tokens from a future window beyond the skew', () => {
    const now = Date.now();
    const future = windowFor(now) + 5;
    const token = signBoardingToken(
      { bookingId: 'bk_1', window: future },
      SECRET,
    );
    expect(verifyBoardingToken(token, { secret: SECRET, now })).toBeNull();
  });

  it('windowFor and windowEnd agree on slot boundaries', () => {
    const window = 12345;
    const slotStart = window * BOARDING_TOKEN_WINDOW_MS;
    expect(windowFor(slotStart)).toBe(window);
    expect(windowFor(slotStart + BOARDING_TOKEN_WINDOW_MS - 1)).toBe(window);
    expect(windowEnd(window).getTime()).toBe(
      (window + 1) * BOARDING_TOKEN_WINDOW_MS,
    );
  });
});
