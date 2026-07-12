import {
  FIRST_ALERT_THRESHOLD_SECONDS,
  SUBSEQUENT_INCREASE_THRESHOLD_SECONDS,
  shouldNotifyTrafficDelay,
} from './traffic-alert';

describe('shouldNotifyTrafficDelay', () => {
  describe('first alert (no prior notification)', () => {
    it('does not fire below the 10-minute threshold', () => {
      expect(
        shouldNotifyTrafficDelay(null, FIRST_ALERT_THRESHOLD_SECONDS - 1),
      ).toBe(false);
    });

    it('fires exactly at the 10-minute threshold', () => {
      expect(
        shouldNotifyTrafficDelay(null, FIRST_ALERT_THRESHOLD_SECONDS),
      ).toBe(true);
    });

    it('fires above the threshold', () => {
      expect(
        shouldNotifyTrafficDelay(null, FIRST_ALERT_THRESHOLD_SECONDS + 60),
      ).toBe(true);
    });

    it('does not fire on a zero delay', () => {
      expect(shouldNotifyTrafficDelay(null, 0)).toBe(false);
    });
  });

  describe('subsequent alert (already notified once)', () => {
    const last = 20 * 60;

    it('does not fire when the delay shrinks', () => {
      expect(shouldNotifyTrafficDelay(last, last - 5 * 60)).toBe(false);
    });

    it('does not fire when the delay is unchanged', () => {
      expect(shouldNotifyTrafficDelay(last, last)).toBe(false);
    });

    it('does not fire on a sub-step increase', () => {
      expect(
        shouldNotifyTrafficDelay(
          last,
          last + SUBSEQUENT_INCREASE_THRESHOLD_SECONDS - 1,
        ),
      ).toBe(false);
    });

    it('fires exactly at the 10-minute step', () => {
      expect(
        shouldNotifyTrafficDelay(
          last,
          last + SUBSEQUENT_INCREASE_THRESHOLD_SECONDS,
        ),
      ).toBe(true);
    });

    it('fires on a larger jump', () => {
      expect(
        shouldNotifyTrafficDelay(
          last,
          last + SUBSEQUENT_INCREASE_THRESHOLD_SECONDS * 3,
        ),
      ).toBe(true);
    });

    it('uses the step from `last`, not from the absolute first threshold', () => {
      // last = 30 min, current = 35 min: 5 min increase, below the 10-min step.
      // The function must NOT re-apply the 10-min first-alert threshold here.
      expect(shouldNotifyTrafficDelay(30 * 60, 35 * 60)).toBe(false);
    });
  });
});
