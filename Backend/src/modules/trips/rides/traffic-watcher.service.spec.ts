import { Test, type TestingModule } from '@nestjs/testing';
import { DB } from '@core/database/database.module';
import { TrafficService } from '@integrations/traffic/traffic.service';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { BookingsRepository } from '../bookings/bookings.repository';
import { RidesRepository, type UpcomingActiveRide } from './rides.repository';
import { TrafficWatcherService } from './traffic-watcher.service';

const buildRide = (
  overrides: Partial<UpcomingActiveRide> = {},
): UpcomingActiveRide => ({
  id: 'ride-1',
  tripId: 'trip-1',
  scheduledDeparture: new Date('2026-05-01T09:00:00.000Z'),
  lastTrafficDelayNotifiedSeconds: null,
  driverId: 'driver-1',
  originLat: 41.5381,
  originLng: 2.4445,
  destinationLat: 41.3851,
  destinationLng: 2.1734,
  ...overrides,
});

describe('TrafficWatcherService', () => {
  let service: TrafficWatcherService;
  let findUpcomingActive: jest.Mock;
  let claimTrafficDelayNotification: jest.Mock;
  let findAcceptedPassengersByRide: jest.Mock;
  let getTrafficDelay: jest.Mock;
  let sendTrafficAlert: jest.Mock;

  beforeEach(async () => {
    findUpcomingActive = jest.fn();
    claimTrafficDelayNotification = jest.fn();
    findAcceptedPassengersByRide = jest.fn();
    getTrafficDelay = jest.fn();
    sendTrafficAlert = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrafficWatcherService,
        { provide: DB, useValue: {} },
        {
          provide: RidesRepository,
          useValue: { findUpcomingActive, claimTrafficDelayNotification },
        },
        {
          provide: BookingsRepository,
          useValue: { findAcceptedPassengersByRide },
        },
        { provide: TrafficService, useValue: { getTrafficDelay } },
        { provide: NotificationsService, useValue: { sendTrafficAlert } },
      ],
    }).compile();

    service = module.get(TrafficWatcherService);
  });

  it('does nothing when there are no upcoming rides', async () => {
    findUpcomingActive.mockResolvedValueOnce([]);

    await service.checkTrafficAlerts();

    expect(getTrafficDelay).not.toHaveBeenCalled();
    expect(claimTrafficDelayNotification).not.toHaveBeenCalled();
    expect(sendTrafficAlert).not.toHaveBeenCalled();
  });

  it('skips rides whose delay is below the first-alert threshold', async () => {
    findUpcomingActive.mockResolvedValueOnce([buildRide()]);
    // 5 minutes — below the 10-min threshold.
    getTrafficDelay.mockResolvedValueOnce(5 * 60);

    await service.checkTrafficAlerts();

    expect(claimTrafficDelayNotification).not.toHaveBeenCalled();
    expect(sendTrafficAlert).not.toHaveBeenCalled();
  });

  it('claims, fetches passengers, and notifies driver + accepted passengers when threshold is met', async () => {
    findUpcomingActive.mockResolvedValueOnce([buildRide()]);
    getTrafficDelay.mockResolvedValueOnce(15 * 60); // 15 minutes
    claimTrafficDelayNotification.mockResolvedValueOnce(true);
    findAcceptedPassengersByRide.mockResolvedValueOnce([
      { passengerId: 'passenger-1' },
      { passengerId: 'passenger-2' },
    ]);

    await service.checkTrafficAlerts();

    expect(claimTrafficDelayNotification).toHaveBeenCalledWith(
      expect.anything(),
      'ride-1',
      15 * 60,
    );
    expect(sendTrafficAlert).toHaveBeenCalledTimes(1);
    expect(sendTrafficAlert).toHaveBeenCalledWith(
      ['driver-1', 'passenger-1', 'passenger-2'],
      expect.objectContaining({
        rideId: 'ride-1',
        delayMinutes: 15,
      }),
    );
  });

  it('does not send when the conditional claim returns false (another worker won the race)', async () => {
    findUpcomingActive.mockResolvedValueOnce([buildRide()]);
    getTrafficDelay.mockResolvedValueOnce(15 * 60);
    claimTrafficDelayNotification.mockResolvedValueOnce(false);

    await service.checkTrafficAlerts();

    expect(claimTrafficDelayNotification).toHaveBeenCalledTimes(1);
    expect(findAcceptedPassengersByRide).not.toHaveBeenCalled();
    expect(sendTrafficAlert).not.toHaveBeenCalled();
  });

  it('continues processing remaining rides when one ride throws', async () => {
    const ok = buildRide({ id: 'ride-ok' });
    const broken = buildRide({ id: 'ride-broken' });
    findUpcomingActive.mockResolvedValueOnce([broken, ok]);
    getTrafficDelay
      .mockRejectedValueOnce(new Error('TomTom 503'))
      .mockResolvedValueOnce(15 * 60);
    claimTrafficDelayNotification.mockResolvedValueOnce(true);
    findAcceptedPassengersByRide.mockResolvedValueOnce([]);

    await service.checkTrafficAlerts();

    // Broken ride never gets to the claim step; the OK one does.
    expect(claimTrafficDelayNotification).toHaveBeenCalledTimes(1);
    expect(claimTrafficDelayNotification).toHaveBeenCalledWith(
      expect.anything(),
      'ride-ok',
      15 * 60,
    );
    expect(sendTrafficAlert).toHaveBeenCalledTimes(1);
  });

  it('uses the subsequent-step rule once a prior delay was already notified', async () => {
    // Already notified at 20 min; new delay is 22 min → 2-min increase, below
    // the 10-min step → no claim, no send.
    findUpcomingActive.mockResolvedValueOnce([
      buildRide({ lastTrafficDelayNotifiedSeconds: 20 * 60 }),
    ]);
    getTrafficDelay.mockResolvedValueOnce(22 * 60);

    await service.checkTrafficAlerts();

    expect(claimTrafficDelayNotification).not.toHaveBeenCalled();
    expect(sendTrafficAlert).not.toHaveBeenCalled();
  });
});
