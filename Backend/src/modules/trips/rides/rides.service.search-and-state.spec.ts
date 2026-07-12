/* eslint-disable @typescript-eslint/unbound-method */
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DbClient } from '@core/database/database.module';
import type { Ride } from '@core/database/schema/rides.schema';
import type { Trip } from '@core/database/schema/trips.schema';
import type { WalletService } from '@modules/wallet/wallet.service';
import { DOMAIN_EVENTS } from '@shared/events/event-names';
import type { BookingsRepository } from '../bookings/bookings.repository';
import type { BookingsService } from '../bookings/bookings.service';
import type { TripsRepository } from '../trips/trips.repository';
import type { EnrichedRideRow, RidesRepository } from './rides.repository';
import { RidesService } from './rides.service';

const mkRide = (over: Partial<Ride> = {}): Ride => ({
  id: 'ride_1',
  tripId: 'trip_1',
  scheduledDeparture: new Date('2099-01-01T08:30:00.000Z'),
  status: 'active',
  originLabel: 'Mataro',
  originLat: 41.5381,
  originLng: 2.4445,
  destinationLabel: 'UPF',
  destinationLat: 41.3888,
  destinationLng: 2.1925,
  totalDistanceKm: 34.52,
  seatsOffered: 3,
  seatsOccupied: 0,
  actualCo2SavedKg: null,
  lastTrafficDelayNotifiedSeconds: null,
  startedAt: null,
  flaggedForReview: false,
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
  ...over,
});

const mkTrip = (over: Partial<Trip> = {}): Trip => ({
  id: 'trip_1',
  driverId: 'drv_1',
  carId: 'car_1',
  type: 'sporadic',
  status: 'active',
  originLabel: 'Mataro',
  originLat: 41.5381,
  originLng: 2.4445,
  destinationLabel: 'UPF',
  destinationLat: 41.3888,
  destinationLng: 2.1925,
  conversationStyle: 'casual',
  smokeAllowed: false,
  musicAllowed: true,
  musicGenre: 'indie',
  externalEventProvider: null,
  externalEventId: null,
  departureAt: new Date('2099-01-01T08:30:00.000Z'),
  schedule: null,
  seatsOffered: 3,
  pricePerSeatCents: 500,
  totalDistanceKm: 34.52,
  estimatedDurationMinutes: 28,
  routePolyline: null,
  cancelledAt: null,
  cancellationReason: null,
  archivedAt: null,
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
  ...over,
});

const mkEnriched = (over: Partial<EnrichedRideRow> = {}): EnrichedRideRow => ({
  ride: mkRide(),
  trip: mkTrip(),
  driverId: 'drv_1',
  driverName: 'Aitana',
  driverOrganizationId: null,
  driverOrganizationName: null,
  carModelBrand: 'Toyota',
  carModelName: 'Prius',
  ...over,
});

const expectErrorCode = async (
  promise: Promise<unknown>,
  code: string,
): Promise<void> => {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((err: unknown) => {
    const body = (err as HttpException).getResponse() as { code?: string };
    expect(body.code).toBe(code);
  });
};

describe('RidesService — search, listing, and state transitions', () => {
  let ridesRepo: jest.Mocked<RidesRepository>;
  let bookingsRepo: jest.Mocked<BookingsRepository>;
  let bookingsService: jest.Mocked<BookingsService>;
  let tripsRepo: jest.Mocked<TripsRepository>;
  let walletService: jest.Mocked<WalletService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let db: { transaction: jest.Mock };

  beforeEach(() => {
    ridesRepo = {
      findById: jest.fn(),
      findByIds: jest.fn(),
      findFutureActiveByTrip: jest.fn(),
      hasFutureActive: jest.fn().mockResolvedValue(false),
      findFutureActiveBlockingSensitiveEdit: jest.fn(),
      listForTrip: jest.fn(),
      findEnriched: jest.fn(),
      searchByBoundingBox: jest.fn(),
      lockForUpdate: jest.fn(),
      markCompleted: jest.fn(),
      markStarted: jest.fn(),
      applySeatChange: jest.fn(),
      cancelMany: jest.fn(),
      updateMany: jest.fn(),
      bulkInsert: jest.fn(),
      findUpcomingActive: jest.fn(),
      findIdleInProgress: jest.fn(),
      findStrandedActive: jest.fn(),
      claimTrafficDelayNotification: jest.fn(),
    } as unknown as jest.Mocked<RidesRepository>;

    bookingsRepo = {
      listByRide: jest.fn().mockResolvedValue([]),
      findActiveByRides: jest.fn().mockResolvedValue([]),
      findActiveByRideWithPassenger: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<BookingsRepository>;

    bookingsService = {
      markBookingResolved: jest.fn().mockResolvedValue({ applied: true }),
    } as unknown as jest.Mocked<BookingsService>;

    tripsRepo = {
      exists: jest.fn().mockResolvedValue(true),
      findDriverId: jest.fn().mockResolvedValue('drv_1'),
      archiveIfActive: jest.fn(),
      findCarCo2KgPerKmByTripId: jest
        .fn()
        .mockResolvedValue({ co2KgPerKm: 0.12 }),
    } as unknown as jest.Mocked<TripsRepository>;

    walletService = {
      captureHold: jest.fn().mockResolvedValue({ captured: true }),
      releaseHold: jest.fn().mockResolvedValue({ released: true }),
    } as unknown as jest.Mocked<WalletService>;

    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    db = {
      transaction: jest.fn(async (fn: (tx: DbClient) => Promise<unknown>) =>
        fn({} as DbClient),
      ),
    };
  });

  const makeService = () => {
    const svc = new RidesService(
      db as never,
      eventEmitter,
      ridesRepo,
      bookingsRepo,
      bookingsService,
      tripsRepo,
      walletService,
    );
    Object.assign(svc, { logger: new Logger('RidesService.spec') });
    return svc;
  };

  describe('search', () => {
    it('maps the date and radius into a bounding box and paginates the results', async () => {
      ridesRepo.searchByBoundingBox.mockResolvedValueOnce([
        mkEnriched({ ride: mkRide({ id: 'ride_a' }) }),
        mkEnriched({ ride: mkRide({ id: 'ride_b' }) }),
        mkEnriched({ ride: mkRide({ id: 'ride_c' }) }),
      ]);
      const svc = makeService();

      const result = await svc.search({
        originLat: 41.5,
        originLng: 2.4,
        destinationLat: 41.3,
        destinationLng: 2.2,
        date: '2099-01-01',
        radiusKm: 5,
        seatsNeeded: 1,
        page: 1,
        limit: 2,
      });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
      expect(result.items.map((r) => r.id)).toEqual(['ride_a', 'ride_b']);

      const callArg = ridesRepo.searchByBoundingBox.mock.calls[0][1];
      expect(callArg.seatsNeeded).toBe(1);
      // 5km / 111km-per-deg ≈ 0.045
      expect(callArg.origin.latRange).toBeCloseTo(5 / 111, 4);
      // dayStart should be midnight in Europe/Madrid → 23:00 UTC the prior day
      // (winter) for the 2099-01-01 example.
      const dayStartIso = callArg.date.dayStart.toISOString();
      expect(dayStartIso.startsWith('2098-12-31T23:00')).toBe(true);
    });

    it('returns an empty page when no rides match', async () => {
      ridesRepo.searchByBoundingBox.mockResolvedValueOnce([]);
      const svc = makeService();

      const result = await svc.search({
        originLat: 41.5,
        originLng: 2.4,
        destinationLat: 41.3,
        destinationLng: 2.2,
        date: '2099-01-01',
        radiusKm: 5,
        seatsNeeded: 1,
        page: 1,
        limit: 20,
      });

      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  describe('listForTrip', () => {
    it('returns 404 when the trip does not exist', async () => {
      tripsRepo.exists.mockResolvedValueOnce(false);
      const svc = makeService();

      await expect(
        svc.listForTrip('trip_missing', { page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('passes the requested status/from/to filters through and paginates', async () => {
      ridesRepo.listForTrip.mockResolvedValueOnce([
        mkRide({ id: 'r_1' }),
        mkRide({ id: 'r_2' }),
        mkRide({ id: 'r_3' }),
      ]);
      const svc = makeService();
      const from = new Date('2099-01-01T00:00:00.000Z');
      const to = new Date('2099-02-01T00:00:00.000Z');

      const result = await svc.listForTrip('trip_1', {
        page: 1,
        limit: 2,
        status: ['active', 'completed'],
        from,
        to,
      });

      expect(ridesRepo.listForTrip).toHaveBeenCalledWith(db, 'trip_1', {
        statuses: ['active', 'completed'],
        fromBound: from,
        to,
      });
      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
    });
  });

  describe('cancel', () => {
    it('rejects when the ride is already in progress', async () => {
      ridesRepo.findById.mockResolvedValueOnce(
        mkRide({ status: 'in_progress' }),
      );
      const svc = makeService();

      await expectErrorCode(
        svc.cancel('drv_1', 'ride_1', {}),
        'RIDE_ALREADY_STARTED',
      );
      expect(ridesRepo.cancelMany).not.toHaveBeenCalled();
    });

    it('rejects when caller is not the trip driver', async () => {
      ridesRepo.findById.mockResolvedValueOnce(mkRide());
      tripsRepo.findDriverId.mockResolvedValueOnce('other_driver');
      const svc = makeService();

      await expect(svc.cancel('drv_1', 'ride_1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('cancels, resolves every active booking, and archives the trip when no future-active rides remain', async () => {
      ridesRepo.findById.mockResolvedValueOnce(mkRide());
      bookingsRepo.findActiveByRides.mockResolvedValueOnce([
        { id: 'bk_1' } as never,
        { id: 'bk_2' } as never,
      ]);
      ridesRepo.hasFutureActive.mockResolvedValueOnce(false);
      const svc = makeService();

      await svc.cancel('drv_1', 'ride_1', { cancellationReason: 'flu' });

      expect(ridesRepo.cancelMany).toHaveBeenCalledWith({}, ['ride_1'], 'flu');
      expect(bookingsService.markBookingResolved).toHaveBeenCalledTimes(2);
      expect(tripsRepo.archiveIfActive).toHaveBeenCalledWith({}, 'trip_1');
    });

    it('does not archive the parent trip when a future-active ride remains', async () => {
      ridesRepo.findById.mockResolvedValueOnce(mkRide());
      ridesRepo.hasFutureActive.mockResolvedValueOnce(true);
      const svc = makeService();

      await svc.cancel('drv_1', 'ride_1', {});

      expect(tripsRepo.archiveIfActive).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('rejects when the ride is not in active status', async () => {
      ridesRepo.lockForUpdate.mockResolvedValueOnce(
        mkRide({ status: 'completed' }),
      );
      const svc = makeService();

      await expectErrorCode(
        svc.start('drv_1', 'ride_1'),
        'RIDE_ALREADY_STARTED',
      );
      expect(ridesRepo.markStarted).not.toHaveBeenCalled();
    });

    it('rejects when current time is outside the [-30m, +2h] window', async () => {
      ridesRepo.lockForUpdate.mockResolvedValueOnce(
        mkRide({ scheduledDeparture: new Date('2099-01-01T08:30:00.000Z') }),
      );
      const svc = makeService();

      await expectErrorCode(svc.start('drv_1', 'ride_1'), 'RIDE_NOT_DEPARTED');
      expect(ridesRepo.markStarted).not.toHaveBeenCalled();
    });

    it('marks the ride started when called inside the window', async () => {
      const now = new Date();
      ridesRepo.lockForUpdate.mockResolvedValueOnce(
        mkRide({ scheduledDeparture: new Date(now.getTime() + 5 * 60 * 1000) }),
      );
      ridesRepo.findEnriched.mockResolvedValueOnce(mkEnriched());
      const svc = makeService();

      await svc.start('drv_1', 'ride_1');

      expect(ridesRepo.markStarted).toHaveBeenCalledWith({}, 'ride_1');
    });
  });

  describe('complete', () => {
    it('rejects with conflict when ride is neither active nor in_progress', async () => {
      ridesRepo.lockForUpdate.mockResolvedValueOnce(
        mkRide({ status: 'cancelled' }),
      );
      const svc = makeService();

      await expect(svc.complete('drv_1', 'ride_1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects when completing an active pre-departure ride', async () => {
      ridesRepo.lockForUpdate.mockResolvedValueOnce(
        mkRide({
          status: 'active',
          scheduledDeparture: new Date(Date.now() + 60 * 60 * 1000),
        }),
      );
      const svc = makeService();

      await expectErrorCode(
        svc.complete('drv_1', 'ride_1', {}),
        'RIDE_NOT_DEPARTED',
      );
    });

    it('settles bookings, archives the trip, and emits RIDE_COMPLETED on the happy path', async () => {
      const past = new Date(Date.now() - 60 * 60 * 1000);
      ridesRepo.lockForUpdate.mockResolvedValueOnce(
        mkRide({ status: 'in_progress', scheduledDeparture: past }),
      );
      ridesRepo.findById.mockResolvedValueOnce(
        mkRide({ status: 'in_progress', scheduledDeparture: past }),
      );
      bookingsRepo.listByRide.mockResolvedValueOnce([
        {
          id: 'bk_1',
          status: 'accepted',
          boardedAt: new Date(),
          passengerId: 'pax_1',
        } as never,
      ]);
      ridesRepo.hasFutureActive.mockResolvedValueOnce(false);
      ridesRepo.findEnriched.mockResolvedValueOnce(mkEnriched());
      const svc = makeService();

      await svc.complete('drv_1', 'ride_1', {});

      expect(ridesRepo.markCompleted).toHaveBeenCalledWith(
        {},
        'ride_1',
        expect.objectContaining({ seatsOccupied: 1 }),
      );
      const [, , patch] = ridesRepo.markCompleted.mock.calls[0];
      expect(typeof patch.actualCo2SavedKg).toBe('number');
      expect(tripsRepo.archiveIfActive).toHaveBeenCalledWith({}, 'trip_1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.RIDE_COMPLETED,
        expect.objectContaining({
          rideId: 'ride_1',
          driverId: 'drv_1',
        }),
      );
    });
  });

  describe('settleAndComplete', () => {
    it('captures un-boarded passengers on post-departure default rule', async () => {
      const past = new Date(Date.now() - 60 * 60 * 1000);
      ridesRepo.findById.mockResolvedValueOnce(
        mkRide({ scheduledDeparture: past }),
      );
      bookingsRepo.listByRide.mockResolvedValueOnce([
        {
          id: 'bk_unboarded',
          status: 'accepted',
          boardedAt: null,
          passengerId: 'pax_x',
        } as never,
      ]);
      const svc = makeService();

      const result = await svc.settleAndComplete({} as DbClient, 'ride_1', {
        unscannedOutcomes: [],
      });

      expect(walletService.captureHold).toHaveBeenCalledWith(
        {},
        'bk_unboarded',
      );
      expect(result.capturedCount).toBe(1);
      expect(result.refundedCount).toBe(0);
      // Driver + accepted-passenger get the credit.
      expect(result.recipientUserIds).toEqual(
        expect.arrayContaining(['drv_1', 'pax_x']),
      );
    });

    it('honours the refund override for an un-boarded passenger', async () => {
      const past = new Date(Date.now() - 60 * 60 * 1000);
      ridesRepo.findById.mockResolvedValueOnce(
        mkRide({ scheduledDeparture: past }),
      );
      bookingsRepo.listByRide.mockResolvedValueOnce([
        {
          id: 'bk_refund',
          status: 'accepted',
          boardedAt: null,
          passengerId: 'pax_r',
        } as never,
      ]);
      const svc = makeService();

      const result = await svc.settleAndComplete({} as DbClient, 'ride_1', {
        unscannedOutcomes: [{ bookingId: 'bk_refund', outcome: 'refund' }],
      });

      expect(walletService.releaseHold).toHaveBeenCalledWith({}, 'bk_refund');
      expect(walletService.captureHold).not.toHaveBeenCalled();
      expect(result.refundedCount).toBe(1);
    });

    it('throws an internal error when the car model is missing', async () => {
      const past = new Date(Date.now() - 60 * 60 * 1000);
      ridesRepo.findById.mockResolvedValueOnce(
        mkRide({ scheduledDeparture: past }),
      );
      bookingsRepo.listByRide.mockResolvedValueOnce([]);
      tripsRepo.findCarCo2KgPerKmByTripId.mockResolvedValueOnce(null);
      const svc = makeService();

      await expectErrorCode(
        svc.settleAndComplete({} as DbClient, 'ride_1', {
          unscannedOutcomes: [],
        }),
        'CAR_MODEL_MISSING',
      );
    });
  });

  describe('listBookings', () => {
    it('rejects when the caller is not the trip driver', async () => {
      ridesRepo.findById.mockResolvedValueOnce(mkRide());
      tripsRepo.findDriverId.mockResolvedValueOnce('other');
      const svc = makeService();

      await expect(svc.listBookings('drv_1', 'ride_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns 404 when the ride does not exist', async () => {
      ridesRepo.findById.mockResolvedValueOnce(null);
      const svc = makeService();

      await expect(svc.listBookings('drv_1', 'ride_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
