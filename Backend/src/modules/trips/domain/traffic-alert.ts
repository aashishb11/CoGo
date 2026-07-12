/** Minimum delay before the first alert is sent (10 minutes). */
export const FIRST_ALERT_THRESHOLD_SECONDS = 10 * 60;

/**
 * Subsequent alerts only fire if the delay has grown by at least this amount
 * since the last notification was sent (10 minutes).
 */
export const SUBSEQUENT_INCREASE_THRESHOLD_SECONDS = 10 * 60;

/**
 * Returns true when a traffic alert should be dispatched for the given ride
 * state. Pure function — input is the previously-notified delay (or null on
 * first check) and the current observed delay. Decision rules:
 *
 * - First alert: no prior notification AND delay reaches the 10-minute mark.
 * - Subsequent alert: delay has grown by at least the 10-minute step since
 *   the last push. A shrinking delay never triggers (we don't spam users
 *   with "good news" updates).
 */
export function shouldNotifyTrafficDelay(
  lastNotifiedSeconds: number | null,
  currentDelaySeconds: number,
): boolean {
  if (lastNotifiedSeconds === null) {
    return currentDelaySeconds >= FIRST_ALERT_THRESHOLD_SECONDS;
  }
  return (
    currentDelaySeconds - lastNotifiedSeconds >=
    SUBSEQUENT_INCREASE_THRESHOLD_SECONDS
  );
}
