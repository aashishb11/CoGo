import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { DB } from '@core/database/database.module';
import { DOMAIN_EVENTS } from '@shared/events/event-names';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { WalletRepository } from '@modules/wallet/wallet.repository';
import { WalletService } from '@modules/wallet/wallet.service';
import { RidesRepository } from './rides.repository';
import { RidesService } from './rides.service';
import { RidesSweepService } from './rides-sweep.service';

describe('RidesSweepService', () => {
  let service: RidesSweepService;
  let ridesRepo: {
    findIdleInProgress: jest.Mock;
    findStrandedActive: jest.Mock;
  };
  let walletRepo: { findActiveHoldsOnTerminalBookings: jest.Mock };
  let ridesService: {
    settleAndComplete: jest.Mock;
    expireUnstarted: jest.Mock;
  };
  let walletService: { releaseHold: jest.Mock };
  let notifications: {
    sendRideAutoCompleted: jest.Mock;
    sendRideDriverNoShow: jest.Mock;
    sendRideAutoCancelled: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let loggerError: jest.SpyInstance;

  beforeEach(async () => {
    ridesRepo = {
      findIdleInProgress: jest.fn().mockResolvedValue([]),
      findStrandedActive: jest.fn().mockResolvedValue([]),
    };
    walletRepo = {
      findActiveHoldsOnTerminalBookings: jest.fn().mockResolvedValue([]),
    };
    ridesService = {
      settleAndComplete: jest.fn(),
      expireUnstarted: jest.fn(),
    };
    walletService = {
      releaseHold: jest.fn(),
    };
    notifications = {
      sendRideAutoCompleted: jest.fn().mockResolvedValue(undefined),
      sendRideDriverNoShow: jest.fn().mockResolvedValue(undefined),
      sendRideAutoCancelled: jest.fn().mockResolvedValue(undefined),
    };
    eventEmitter = { emit: jest.fn() };

    const db = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({}),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RidesSweepService,
        { provide: DB, useValue: db },
        { provide: RidesRepository, useValue: ridesRepo },
        { provide: WalletRepository, useValue: walletRepo },
        { provide: RidesService, useValue: ridesService },
        { provide: WalletService, useValue: walletService },
        { provide: NotificationsService, useValue: notifications },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(RidesSweepService);
    // Silence the logger.error spam from the orphan-hold branch in this
    // test suite; tests that need to assert on it re-spy explicitly.
    loggerError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerError.mockRestore();
  });

  describe('idle-in-progress branch', () => {
    it('calls settleAndComplete with no overrides and notifies the driver', async () => {
      ridesRepo.findIdleInProgress.mockResolvedValueOnce(['ride_1']);
      ridesService.settleAndComplete.mockResolvedValueOnce({
        actualCo2SavedKg: 1.2,
        seatsOccupied: 2,
        recipientUserIds: ['drv_1', 'p_1'],
        driverId: 'drv_1',
        capturedCount: 2,
        refundedCount: 1,
      });

      const result = await service.sweep();

      expect(result.completed).toBe(1);
      expect(ridesService.settleAndComplete).toHaveBeenCalledWith(
        expect.anything(),
        'ride_1',
        { unscannedOutcomes: [] },
      );
      expect(notifications.sendRideAutoCompleted).toHaveBeenCalledWith(
        'drv_1',
        { rideId: 'ride_1', capturedCount: 2, refundedCount: 1 },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.RIDE_COMPLETED,
        {
          rideId: 'ride_1',
          driverId: 'drv_1',
          recipientUserIds: ['drv_1', 'p_1'],
          actualCo2SavedKg: 1.2,
        },
      );
    });

    it('does not emit RIDE_COMPLETED when settleAndComplete throws', async () => {
      ridesRepo.findIdleInProgress.mockResolvedValueOnce(['ride_bad']);
      ridesService.settleAndComplete.mockRejectedValueOnce(new Error('boom'));

      const result = await service.sweep();

      expect(result.completed).toBe(0);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('swallows a per-row error and still processes the rest', async () => {
      ridesRepo.findIdleInProgress.mockResolvedValueOnce([
        'ride_bad',
        'ride_ok',
      ]);
      ridesService.settleAndComplete
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({
          actualCo2SavedKg: 0,
          seatsOccupied: 0,
          recipientUserIds: ['drv'],
          driverId: 'drv',
          capturedCount: 0,
          refundedCount: 0,
        });

      const result = await service.sweep();

      expect(result.completed).toBe(1);
      expect(ridesService.settleAndComplete).toHaveBeenCalledTimes(2);
    });
  });

  describe('stranded-active branch', () => {
    it('calls expireUnstarted and notifies driver + every affected passenger', async () => {
      ridesRepo.findStrandedActive.mockResolvedValueOnce(['ride_1']);
      ridesService.expireUnstarted.mockResolvedValueOnce({
        applied: true,
        driverId: 'drv_1',
        affectedPassengerIds: ['p_1', 'p_2'],
      });

      const result = await service.sweep();

      expect(result.cancelled).toBe(1);
      expect(ridesService.expireUnstarted).toHaveBeenCalledWith(
        expect.anything(),
        'ride_1',
      );
      expect(notifications.sendRideDriverNoShow).toHaveBeenCalledWith('drv_1', {
        rideId: 'ride_1',
      });
      expect(notifications.sendRideAutoCancelled).toHaveBeenCalledWith(
        ['p_1', 'p_2'],
        { rideId: 'ride_1' },
      );
    });

    it('skips notifications when expireUnstarted reports applied=false (race)', async () => {
      ridesRepo.findStrandedActive.mockResolvedValueOnce(['ride_1']);
      ridesService.expireUnstarted.mockResolvedValueOnce({
        applied: false,
        driverId: null,
        affectedPassengerIds: [],
      });

      const result = await service.sweep();

      expect(result.cancelled).toBe(0);
      expect(notifications.sendRideDriverNoShow).not.toHaveBeenCalled();
      expect(notifications.sendRideAutoCancelled).not.toHaveBeenCalled();
    });
  });

  describe('orphan-hold backstop', () => {
    it('releases each orphan hold and logs a structured error per hit', async () => {
      walletRepo.findActiveHoldsOnTerminalBookings.mockResolvedValueOnce([
        { holdId: 'h1', bookingId: 'bk1' },
        { holdId: 'h2', bookingId: 'bk2' },
      ]);
      walletService.releaseHold
        .mockResolvedValueOnce({ released: true })
        .mockResolvedValueOnce({ released: true });

      const result = await service.sweep();

      expect(result.orphanHoldsReleased).toBe(2);
      expect(walletService.releaseHold).toHaveBeenCalledTimes(2);
      const orphanErrorCalls = (loggerError.mock.calls as unknown[][]).filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('orphan hold released'),
      );
      expect(orphanErrorCalls).toHaveLength(2);
      expect(orphanErrorCalls[0][1]).toMatchObject({
        bookingId: 'bk1',
        holdId: 'h1',
      });
    });

    it('counts only holds that actually released (released=false is a race no-op)', async () => {
      walletRepo.findActiveHoldsOnTerminalBookings.mockResolvedValueOnce([
        { holdId: 'h1', bookingId: 'bk1' },
      ]);
      walletService.releaseHold.mockResolvedValueOnce({ released: false });

      const result = await service.sweep();

      expect(result.orphanHoldsReleased).toBe(0);
      const orphanErrorCalls = (loggerError.mock.calls as unknown[][]).filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('orphan hold released'),
      );
      expect(orphanErrorCalls).toHaveLength(0);
    });
  });
});
