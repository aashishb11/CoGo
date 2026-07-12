import { Test, type TestingModule } from '@nestjs/testing';
import { DB } from '@core/database/database.module';
import { TrustedContactService } from '@modules/safety/trusted-contact.service';
import { WalletRepository } from '@modules/wallet/wallet.repository';
import { WalletService } from '@modules/wallet/wallet.service';
import { ChatRepository } from '../chat/chat.repository';
import { RidesRepository } from '../rides/rides.repository';
import { TripsRepository } from '../trips/trips.repository';
import { BookingsRepository } from './bookings.repository';
import { BookingsService } from './bookings.service';

// Sentinel value passed to the transaction callback so we can assert that
// `upsertThread` and `insertMany` both receive the same `tx` handle.
const TX_HANDLE = { __tx: true } as const;

const DRIVER_ID = 'driver-1';
const PASSENGER_ID = 'passenger-1';
const TRIP_ID = 'trip-1';

const buildRide = (id: string) => ({
  id,
  tripId: TRIP_ID,
  status: 'active' as const,
  scheduledDeparture: new Date('2099-01-01T10:00:00.000Z'),
});

describe('BookingsService — chat-thread side effect', () => {
  let service: BookingsService;
  let tripsFindById: jest.Mock;
  let ridesFindByIds: jest.Mock;
  let insertMany: jest.Mock;
  let upsertThread: jest.Mock;
  let db: { transaction: jest.Mock };

  beforeEach(async () => {
    tripsFindById = jest.fn();
    ridesFindByIds = jest.fn();
    insertMany = jest.fn();
    upsertThread = jest.fn().mockImplementation((_tx, data: { id: string }) =>
      Promise.resolve({
        id: data.id,
        tripId: TRIP_ID,
        passengerId: PASSENGER_ID,
        createdAt: new Date(),
        driverLastReadAt: null,
        passengerLastReadAt: null,
      }),
    );
    db = {
      transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(TX_HANDLE)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: DB, useValue: db },
        {
          provide: BookingsRepository,
          useValue: { insertMany },
        },
        { provide: RidesRepository, useValue: { findByIds: ridesFindByIds } },
        { provide: TripsRepository, useValue: { findById: tripsFindById } },
        { provide: ChatRepository, useValue: { upsertThread } },
        {
          provide: TrustedContactService,
          useValue: {
            assertHasContact: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: WalletService,
          useValue: {
            getOrCreateWallet: jest.fn().mockResolvedValue({
              userId: PASSENGER_ID,
              balanceCents: 1_000_000,
              heldCents: 0,
            }),
            placeHold: jest.fn(),
            releaseHold: jest.fn(),
            captureHold: jest.fn(),
          },
        },
        {
          provide: WalletRepository,
          useValue: {
            findByUserIdForUpdate: jest.fn().mockResolvedValue({
              userId: PASSENGER_ID,
              balanceCents: 1_000_000,
              heldCents: 0,
            }),
          },
        },
      ],
    }).compile();

    service = module.get(BookingsService);
  });

  it('first booking on a trip calls upsertThread once with the transaction handle', async () => {
    tripsFindById.mockResolvedValueOnce({
      id: TRIP_ID,
      driverId: DRIVER_ID,
    });
    const ride = buildRide('ride-1');
    ridesFindByIds.mockResolvedValueOnce([ride]);
    insertMany.mockImplementationOnce((_tx, rows: { id: string }[]) =>
      Promise.resolve(
        rows.map((r) => ({
          id: r.id,
          passengerId: PASSENGER_ID,
          rideId: 'ride-1',
          status: 'pending',
          message: null,
          requestedAt: new Date(),
          acceptedAt: null,
          rejectedAt: null,
          cancelledAt: null,
        })),
      ),
    );

    await service.createBatch(PASSENGER_ID, TRIP_ID, { rideIds: ['ride-1'] });

    expect(upsertThread).toHaveBeenCalledTimes(1);
    expect(upsertThread).toHaveBeenCalledWith(
      TX_HANDLE,
      expect.objectContaining({
        tripId: TRIP_ID,
        passengerId: PASSENGER_ID,
      }),
    );
    // insertMany must have used the same tx handle as upsertThread.
    expect(insertMany).toHaveBeenCalledWith(TX_HANDLE, expect.any(Array));
  });

  it('repeat booking on the same trip+passenger still calls upsertThread (repo dedupes)', async () => {
    tripsFindById.mockResolvedValue({ id: TRIP_ID, driverId: DRIVER_ID });
    const rideA = buildRide('ride-a');
    const rideB = buildRide('ride-b');
    ridesFindByIds
      .mockResolvedValueOnce([rideA])
      .mockResolvedValueOnce([rideB]);

    const insertedRow = (id: string, rideId: string) => ({
      id,
      passengerId: PASSENGER_ID,
      rideId,
      status: 'pending' as const,
      message: null,
      requestedAt: new Date(),
      acceptedAt: null,
      rejectedAt: null,
      cancelledAt: null,
    });
    insertMany
      .mockImplementationOnce((_tx, rows: { id: string }[]) =>
        Promise.resolve(rows.map((r) => insertedRow(r.id, 'ride-a'))),
      )
      .mockImplementationOnce((_tx, rows: { id: string }[]) =>
        Promise.resolve(rows.map((r) => insertedRow(r.id, 'ride-b'))),
      );

    const first = await service.createBatch(PASSENGER_ID, TRIP_ID, {
      rideIds: ['ride-a'],
    });
    const second = await service.createBatch(PASSENGER_ID, TRIP_ID, {
      rideIds: ['ride-b'],
    });

    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(upsertThread).toHaveBeenCalledTimes(2);
    // Both invocations target the same (trip, passenger) key — dedupe is the
    // repo's job (`onConflictDoNothing`), not the service's.
    expect(upsertThread).toHaveBeenNthCalledWith(
      1,
      TX_HANDLE,
      expect.objectContaining({
        tripId: TRIP_ID,
        passengerId: PASSENGER_ID,
      }),
    );
    expect(upsertThread).toHaveBeenNthCalledWith(
      2,
      TX_HANDLE,
      expect.objectContaining({
        tripId: TRIP_ID,
        passengerId: PASSENGER_ID,
      }),
    );
  });
});
