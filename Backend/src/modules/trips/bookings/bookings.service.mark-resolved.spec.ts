import { Test, type TestingModule } from '@nestjs/testing';
import type { DbClient } from '@core/database/database.module';
import { DB } from '@core/database/database.module';
import { TrustedContactService } from '@modules/safety/trusted-contact.service';
import { WalletRepository } from '@modules/wallet/wallet.repository';
import { WalletService } from '@modules/wallet/wallet.service';
import { ChatRepository } from '../chat/chat.repository';
import { RidesRepository } from '../rides/rides.repository';
import { TripsRepository } from '../trips/trips.repository';
import { BookingsRepository } from './bookings.repository';
import { BookingsService } from './bookings.service';

describe('BookingsService.markBookingResolved', () => {
  let service: BookingsService;
  let resolveOneIfNonTerminal: jest.Mock;
  let releaseHold: jest.Mock;

  beforeEach(async () => {
    resolveOneIfNonTerminal = jest.fn();
    releaseHold = jest.fn().mockResolvedValue({ released: false });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: DB, useValue: {} },
        {
          provide: BookingsRepository,
          useValue: { resolveOneIfNonTerminal },
        },
        { provide: RidesRepository, useValue: {} },
        { provide: TripsRepository, useValue: {} },
        { provide: ChatRepository, useValue: {} },
        {
          provide: TrustedContactService,
          useValue: { assertHasContact: jest.fn() },
        },
        { provide: WalletService, useValue: { releaseHold } },
        { provide: WalletRepository, useValue: {} },
      ],
    }).compile();

    service = module.get(BookingsService);
  });

  it('flips the booking and releases the hold when the row was non-terminal', async () => {
    resolveOneIfNonTerminal.mockResolvedValueOnce([{ id: 'bk_1' }]);
    releaseHold.mockResolvedValueOnce({ released: true });

    const res = await service.markBookingResolved(
      {} as DbClient,
      'bk_1',
      'cancelled',
    );

    expect(res.applied).toBe(true);
    expect(resolveOneIfNonTerminal).toHaveBeenCalledWith(
      {},
      'bk_1',
      'cancelled',
    );
    expect(releaseHold).toHaveBeenCalledWith({}, 'bk_1');
  });

  it('skips the hold release when the booking was already terminal', async () => {
    resolveOneIfNonTerminal.mockResolvedValueOnce([]);

    const res = await service.markBookingResolved(
      {} as DbClient,
      'bk_1',
      'rejected',
    );

    expect(res.applied).toBe(false);
    expect(releaseHold).not.toHaveBeenCalled();
  });

  it('treats a no-hold case as success and does not throw', async () => {
    resolveOneIfNonTerminal.mockResolvedValueOnce([{ id: 'bk_1' }]);
    releaseHold.mockResolvedValueOnce({ released: false });

    const res = await service.markBookingResolved(
      {} as DbClient,
      'bk_1',
      'expired',
    );

    expect(res.applied).toBe(true);
    expect(releaseHold).toHaveBeenCalledWith({}, 'bk_1');
  });
});
