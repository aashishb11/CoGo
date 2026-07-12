import { Test, type TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DbClient } from '@core/database/database.module';
import { DB } from '@core/database/database.module';
import { WalletService } from '@modules/wallet/wallet.service';
import { BookingsRepository } from '../bookings/bookings.repository';
import { BookingsService } from '../bookings/bookings.service';
import { TripsRepository } from '../trips/trips.repository';
import { RidesRepository } from './rides.repository';
import {
  DRIVER_NO_SHOW_CANCELLATION_REASON,
  RidesService,
} from './rides.service';

describe('RidesService.expireUnstarted', () => {
  let service: RidesService;
  let ridesRepo: {
    findById: jest.Mock;
    cancelMany: jest.Mock;
    hasFutureActive: jest.Mock;
  };
  let bookingsRepo: { findActiveByRideWithPassenger: jest.Mock };
  let bookingsService: { markBookingResolved: jest.Mock };
  let tripsRepo: { archiveIfActive: jest.Mock; findDriverId: jest.Mock };

  beforeEach(async () => {
    ridesRepo = {
      findById: jest.fn(),
      cancelMany: jest.fn().mockResolvedValue(undefined),
      hasFutureActive: jest.fn().mockResolvedValue(false),
    };
    bookingsRepo = {
      findActiveByRideWithPassenger: jest.fn().mockResolvedValue([]),
    };
    bookingsService = {
      markBookingResolved: jest.fn().mockResolvedValue({ applied: true }),
    };
    tripsRepo = {
      archiveIfActive: jest.fn().mockResolvedValue(undefined),
      findDriverId: jest.fn().mockResolvedValue('drv_1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RidesService,
        { provide: DB, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: RidesRepository, useValue: ridesRepo },
        { provide: BookingsRepository, useValue: bookingsRepo },
        { provide: BookingsService, useValue: bookingsService },
        { provide: TripsRepository, useValue: tripsRepo },
        { provide: WalletService, useValue: {} },
      ],
    }).compile();

    service = module.get(RidesService);
  });

  it('cancels the ride with reason driver_no_show and cascades booking resolutions', async () => {
    ridesRepo.findById.mockResolvedValueOnce({
      id: 'ride_1',
      tripId: 'trip_1',
      status: 'active',
      startedAt: null,
    });
    bookingsRepo.findActiveByRideWithPassenger.mockResolvedValueOnce([
      { id: 'bk_a', passengerId: 'p_a', status: 'accepted' },
      { id: 'bk_p', passengerId: 'p_p', status: 'pending' },
    ]);

    const result = await service.expireUnstarted({} as DbClient, 'ride_1');

    expect(result).toEqual({
      applied: true,
      driverId: 'drv_1',
      affectedPassengerIds: ['p_a', 'p_p'],
    });
    expect(ridesRepo.cancelMany).toHaveBeenCalledWith(
      {},
      ['ride_1'],
      DRIVER_NO_SHOW_CANCELLATION_REASON,
    );
    // accepted -> rejected
    expect(bookingsService.markBookingResolved).toHaveBeenNthCalledWith(
      1,
      {},
      'bk_a',
      'rejected',
    );
    // pending -> expired (releaseHold is a no-op for pending; the seam is
    // still the right funnel so the orphan-hold cron sees zero hits)
    expect(bookingsService.markBookingResolved).toHaveBeenNthCalledWith(
      2,
      {},
      'bk_p',
      'expired',
    );
  });

  it('archives the parent trip when no future active rides remain', async () => {
    ridesRepo.findById.mockResolvedValueOnce({
      id: 'ride_1',
      tripId: 'trip_1',
      status: 'active',
      startedAt: null,
    });
    ridesRepo.hasFutureActive.mockResolvedValueOnce(false);

    await service.expireUnstarted({} as DbClient, 'ride_1');

    expect(tripsRepo.archiveIfActive).toHaveBeenCalledWith({}, 'trip_1');
  });

  it('does NOT archive the trip when a future active ride still exists', async () => {
    ridesRepo.findById.mockResolvedValueOnce({
      id: 'ride_1',
      tripId: 'trip_1',
      status: 'active',
      startedAt: null,
    });
    ridesRepo.hasFutureActive.mockResolvedValueOnce(true);

    await service.expireUnstarted({} as DbClient, 'ride_1');

    expect(tripsRepo.archiveIfActive).not.toHaveBeenCalled();
  });

  it('is a no-op when the ride moved out from under us (race)', async () => {
    ridesRepo.findById.mockResolvedValueOnce({
      id: 'ride_1',
      tripId: 'trip_1',
      status: 'in_progress',
      startedAt: new Date(),
    });

    const result = await service.expireUnstarted({} as DbClient, 'ride_1');

    expect(result.applied).toBe(false);
    expect(ridesRepo.cancelMany).not.toHaveBeenCalled();
  });

  it('returns applied=false silently when the ride is missing', async () => {
    ridesRepo.findById.mockResolvedValueOnce(null);
    const result = await service.expireUnstarted({} as DbClient, 'gone');
    expect(result.applied).toBe(false);
    expect(ridesRepo.cancelMany).not.toHaveBeenCalled();
  });
});
