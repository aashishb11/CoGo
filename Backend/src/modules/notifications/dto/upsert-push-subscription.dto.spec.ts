import { IsPushEndpointConstraint } from './upsert-push-subscription.dto';

describe('IsPushEndpointConstraint', () => {
  const c = new IsPushEndpointConstraint();

  it('accepts an Expo push token', () => {
    expect(c.validate('ExponentPushToken[abc123]')).toBe(true);
    expect(c.validate('ExpoPushToken[abc123]')).toBe(true);
  });

  it('accepts an https Web Push URL', () => {
    expect(c.validate('https://fcm.googleapis.com/fcm/send/dE8')).toBe(true);
  });

  it('rejects non-https URLs and non-string/empty values', () => {
    expect(c.validate('http://insecure.example/endpoint')).toBe(false);
    expect(c.validate('not-a-url')).toBe(false);
    expect(c.validate('')).toBe(false);
    expect(c.validate(undefined)).toBe(false);
  });
});
