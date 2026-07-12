// web-push is a CJS default export; mock it so the constructor's
// setVapidDetails is a no-op and we can assert on sendNotification.
jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
}));

// Locale resolution hits the DB; stub it so the service runs with a fixed
// fallback locale and no real query.
jest.mock('@shared/i18n/locale', () => ({
  FALLBACK_LOCALE: 'es',
  resolveLocalesByUserIds: jest.fn().mockResolvedValue(new Map()),
}));

import webpush from 'web-push';
import type { PushSubscription } from '@core/database/schema/push-subscriptions.schema';
import { NotificationsService } from './notifications.service';

const sendNotification = webpush.sendNotification as jest.Mock;

function buildSub(overrides: Partial<PushSubscription>): PushSubscription {
  return {
    id: 'sub-1',
    userId: 'u1',
    endpoint: 'https://push.example/endpoint',
    keys: { p256dh: 'p', auth: 'a' },
    settings: { traffic_alerts: true },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('NotificationsService delivery routing', () => {
  const fetchMock = jest.fn();
  const repo = { findByUserIds: jest.fn(), deleteById: jest.fn() };
  const config = {
    getOrThrow: jest.fn().mockReturnValue('vapid-stub'),
    get: jest.fn().mockReturnValue(undefined),
  };
  let service: NotificationsService;

  const payload = {
    rideId: 'r1',
    delayMinutes: 11,
    scheduledDeparture: new Date('2026-05-28T10:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new NotificationsService(
      {} as never,
      config as never,
      repo as never,
    );
  });

  it('routes Web Push endpoints through web-push, not Expo', async () => {
    repo.findByUserIds.mockResolvedValue([
      buildSub({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }),
    ]);

    await service.sendTrafficAlert(['u1'], payload);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes Expo push tokens through the Expo push service, not web-push', async () => {
    repo.findByUserIds.mockResolvedValue([
      buildSub({ endpoint: 'ExponentPushToken[abc123]' }),
    ]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { status: 'ok', id: 't1' } }),
    });

    await service.sendTrafficAlert(['u1'], payload);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const sent = JSON.parse(init.body) as Array<{ to: string }>;
    expect(sent[0].to).toBe('ExponentPushToken[abc123]');
  });

  it('prunes an Expo subscription when the ticket reports DeviceNotRegistered', async () => {
    repo.findByUserIds.mockResolvedValue([
      buildSub({ id: 'dead-sub', endpoint: 'ExponentPushToken[gone]' }),
    ]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { status: 'error', details: { error: 'DeviceNotRegistered' } },
        }),
    });

    await service.sendTrafficAlert(['u1'], payload);

    expect(repo.deleteById).toHaveBeenCalledWith(expect.anything(), 'dead-sub');
  });
});
