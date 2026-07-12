/* eslint-disable @typescript-eslint/unbound-method */
import {
  HttpException,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DbClient } from '@core/database/database.module';
import type { Trip } from '@core/database/schema/trips.schema';
import type { CultucatService } from '@modules/cultucat/cultucat.service';
import type { RoutingService } from '@integrations/routing/routing.service';
import type { TrustedContactService } from '@modules/safety/trusted-contact.service';
import type { BookingsRepository } from '../bookings/bookings.repository';
import type { BookingsService } from '../bookings/bookings.service';
import type { RidesRepository } from '../rides/rides.repository';
import { TripsService } from './trips.service';
import type { TripsRepository } from './trips.repository';

const mkTrip = (over: Partial<Trip> = {}): Trip => ({
  id: 'trip_1',
  driverId: 'drv_1',
  carId: 'car_1',
  type: 'sporadic',
  status: 'active',
  originLabel: 'Mataro',
  originLat: 41.5381,
  originLng: 2.4445,
  destinationLabel: 'UPF Ciutadella',
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

const DRIVER_JOIN = {
  driverId: 'drv_1',
  driverName: 'Aitana',
  driverOrganizationId: null,
  driverOrganizationName: null,
  co2KgPerKm: 0.12,
} as const;

describe('TripsService', () => {
  let tripsRepo: jest.Mocked<TripsRepository>;
  let ridesRepo: jest.Mocked<RidesRepository>;
  let bookingsRepo: jest.Mocked<BookingsRepository>;
  let bookingsService: jest.Mocked<BookingsService>;
  let routingService: jest.Mocked<RoutingService>;
  let cultucatService: jest.Mocked<CultucatService>;
  let trustedContactService: jest.Mocked<TrustedContactService>;
  let config: jest.Mocked<ConfigService>;
  let db: { transaction: jest.Mock };

  beforeEach(() => {
    tripsRepo = {
      findById: jest.fn(),
      exists: jest.fn(),
      existsActiveByCar: jest.fn(),
      findDriverId: jest.fn(),
      findWithDriverById: jest.fn(),
      listMineWithDriver: jest.fn(),
      findCarCo2KgPerKmByTripId: jest.fn(),
      findOwnedCar: jest.fn(),
      insertOne: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
      archiveIfActive: jest.fn(),
    } as unknown as jest.Mocked<TripsRepository>;

    ridesRepo = {
      bulkInsert: jest.fn(),
      findFutureActiveByTrip: jest.fn().mockResolvedValue([]),
      findFutureActiveBlockingSensitiveEdit: jest.fn().mockResolvedValue([]),
      cancelMany: jest.fn(),
      updateMany: jest.fn(),
    } as unknown as jest.Mocked<RidesRepository>;

    bookingsRepo = {
      findActiveByRides: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<BookingsRepository>;

    bookingsService = {
      markBookingResolved: jest.fn().mockResolvedValue({ applied: true }),
    } as unknown as jest.Mocked<BookingsService>;

    routingService = {
      getRoute: jest.fn().mockResolvedValue({
        distanceKm: 34.52,
        durationMinutes: 28,
        polyline: 'poly',
      }),
    } as unknown as jest.Mocked<RoutingService>;

    cultucatService = {
      getEventCoordinatesForTrip: jest.fn(),
    } as unknown as jest.Mocked<CultucatService>;

    trustedContactService = {
      assertHasContact: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TrustedContactService>;

    config = {
      get: jest.fn().mockReturnValue(5),
    } as unknown as jest.Mocked<ConfigService>;

    db = {
      transaction: jest.fn(async (fn: (tx: DbClient) => Promise<unknown>) =>
        fn({} as DbClient),
      ),
    };
  });

  const makeService = () => {
    const svc = new TripsService(
      db as never,
      config,
      routingService,
      cultucatService,
      tripsRepo,
      ridesRepo,
      bookingsRepo,
      bookingsService,
      trustedContactService,
    );
    Object.assign(svc, { logger: new Logger('TripsService.spec') });
    return svc;
  };

  describe('create', () => {
    const baseBody = {
      carId: 'car_1',
      type: 'sporadic' as const,
      origin: { label: 'Mataro', lat: 41.5381, lng: 2.4445 },
      destination: { label: 'UPF', lat: 41.3888, lng: 2.1925 },
      musicAllowed: true,
      seatsOffered: 3,
      pricePerSeatCents: 500,
      departureAt: new Date('2099-01-01T08:30:00.000Z'),
    };

    it('persists the trip and returns the detail view on the happy path', async () => {
      tripsRepo.findOwnedCar.mockResolvedValueOnce({
        id: 'car_1',
        userId: 'drv_1',
      });
      tripsRepo.findWithDriverById.mockResolvedValueOnce({
        trip: mkTrip(),
        ...DRIVER_JOIN,
      });

      const svc = makeService();
      const result = await svc.create('drv_1', { ...baseBody });

      expect(result.id).toBe('trip_1');
      expect(tripsRepo.insertOne).toHaveBeenCalledTimes(1);
      expect(trustedContactService.assertHasContact).toHaveBeenCalledWith(
        {},
        'drv_1',
      );
      expect(ridesRepo.bulkInsert).toHaveBeenCalledTimes(1);
      const inserted = ridesRepo.bulkInsert.mock.calls[0][1];
      expect(inserted.length).toBeGreaterThan(0);
    });

    it('rejects creating a trip with a car owned by someone else', async () => {
      tripsRepo.findOwnedCar.mockResolvedValueOnce({
        id: 'car_1',
        userId: 'other_user',
      });

      const svc = makeService();
      await expectErrorCode(
        svc.create('drv_1', { ...baseBody }),
        'CAR_NOT_OWNED',
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects creating a recurring trip whose window has no future rides left', async () => {
      tripsRepo.findOwnedCar.mockResolvedValueOnce({
        id: 'car_1',
        userId: 'drv_1',
      });

      const svc = makeService();
      const recurringPast = {
        carId: 'car_1',
        type: 'recurring' as const,
        origin: { label: 'Mataro', lat: 41.5381, lng: 2.4445 },
        destination: { label: 'UPF', lat: 41.3888, lng: 2.1925 },
        musicAllowed: true,
        seatsOffered: 3,
        pricePerSeatCents: 500,
        schedule: {
          daysOfWeek: {
            monday: true,
            tuesday: true,
            wednesday: true,
            thursday: true,
            friday: true,
            saturday: true,
            sunday: true,
          },
          timeOfDay: '08:30',
        },
        startDate: '2000-01-01',
        endDate: '2000-01-07',
      };
      await expectErrorCode(
        svc.create('drv_1', recurringPast),
        'NO_FUTURE_RIDES_IN_WINDOW',
      );
    });
  });

  describe('listMine', () => {
    it('paginates the driver-owned trips with the requested status filter', async () => {
      const rows = Array.from({ length: 3 }, (_, i) => ({
        trip: mkTrip({ id: `trip_${i + 1}` }),
        ...DRIVER_JOIN,
      }));
      tripsRepo.listMineWithDriver.mockResolvedValueOnce(rows);

      const svc = makeService();
      const result = await svc.listMine('drv_1', {
        page: 1,
        limit: 2,
        status: ['active'],
      });

      expect(tripsRepo.listMineWithDriver).toHaveBeenCalledWith(db, 'drv_1', [
        'active',
      ]);
      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
      expect(result.items.map((t) => t.id)).toEqual(['trip_1', 'trip_2']);
    });

    it('defaults to active + cancelled when no status filter is supplied', async () => {
      tripsRepo.listMineWithDriver.mockResolvedValueOnce([]);
      const svc = makeService();

      await svc.listMine('drv_1', { page: 1, limit: 20 });

      expect(tripsRepo.listMineWithDriver).toHaveBeenCalledWith(db, 'drv_1', [
        'active',
        'cancelled',
      ]);
    });
  });

  describe('getById', () => {
    it('returns 404 when the trip does not exist', async () => {
      tripsRepo.findWithDriverById.mockResolvedValueOnce(null);
      const svc = makeService();

      await expect(svc.getById('trip_missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('rejects updates that touch any immutable schedule field', async () => {
      const svc = makeService();
      await expectErrorCode(
        svc.update('trip_1', 'drv_1', {
          departureAt: new Date('2099-01-01T09:00:00.000Z'),
        }),
        'SCHEDULE_FIELDS_IMMUTABLE',
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects when the requester is not the trip driver', async () => {
      tripsRepo.findDriverId.mockResolvedValueOnce('other_drv');
      const svc = makeService();

      await expect(
        svc.update('trip_1', 'drv_1', { seatsOffered: 4 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a sensitive edit when future-active rides still have non-terminal bookings', async () => {
      tripsRepo.findDriverId.mockResolvedValueOnce('drv_1');
      tripsRepo.findById.mockResolvedValueOnce(mkTrip());
      ridesRepo.findFutureActiveBlockingSensitiveEdit.mockResolvedValueOnce([
        'ride_a',
      ]);
      const svc = makeService();

      await expectErrorCode(
        svc.update('trip_1', 'drv_1', { seatsOffered: 4 }),
        'ACTIVE_BOOKINGS_PRESENT',
      );
      expect(tripsRepo.update).not.toHaveBeenCalled();
    });

    it('applies a non-sensitive edit without re-routing or re-snapshotting rides', async () => {
      tripsRepo.findDriverId.mockResolvedValueOnce('drv_1');
      tripsRepo.findById.mockResolvedValueOnce(mkTrip());
      tripsRepo.findWithDriverById.mockResolvedValueOnce({
        trip: mkTrip({ smokeAllowed: true }),
        ...DRIVER_JOIN,
      });
      const svc = makeService();

      const result = await svc.update('trip_1', 'drv_1', {
        smokeAllowed: true,
      });

      expect(routingService.getRoute).not.toHaveBeenCalled();
      expect(ridesRepo.updateMany).not.toHaveBeenCalled();
      expect(tripsRepo.update).toHaveBeenCalledWith(
        {},
        'trip_1',
        expect.objectContaining({ smokeAllowed: true }),
      );
      expect(result.id).toBe('trip_1');
    });

    it('recomputes the route and re-snapshots future-active rides on a destination change', async () => {
      tripsRepo.findDriverId.mockResolvedValueOnce('drv_1');
      tripsRepo.findById.mockResolvedValueOnce(mkTrip());
      ridesRepo.findFutureActiveBlockingSensitiveEdit.mockResolvedValueOnce([]);
      ridesRepo.findFutureActiveByTrip.mockResolvedValueOnce([
        { id: 'ride_future' } as never,
      ]);
      routingService.getRoute.mockResolvedValueOnce({
        distanceKm: 40,
        durationMinutes: 35,
        polyline: 'newpoly',
      });
      tripsRepo.findWithDriverById.mockResolvedValueOnce({
        trip: mkTrip(),
        ...DRIVER_JOIN,
      });
      const svc = makeService();

      await svc.update('trip_1', 'drv_1', {
        destination: { label: 'New Dest', lat: 41.4, lng: 2.2 },
      });

      expect(routingService.getRoute).toHaveBeenCalledTimes(1);
      expect(tripsRepo.update).toHaveBeenCalledWith(
        {},
        'trip_1',
        expect.objectContaining({
          destinationLabel: 'New Dest',
          totalDistanceKm: 40,
          estimatedDurationMinutes: 35,
          routePolyline: 'newpoly',
        }),
      );
      expect(ridesRepo.updateMany).toHaveBeenCalledWith(
        {},
        ['ride_future'],
        expect.objectContaining({
          destinationLabel: 'New Dest',
          totalDistanceKm: 40,
        }),
      );
    });
  });

  describe('cancel', () => {
    it('cancels the trip and funnels every active future booking through the resolution seam', async () => {
      tripsRepo.findDriverId.mockResolvedValueOnce('drv_1');
      ridesRepo.findFutureActiveByTrip.mockResolvedValueOnce([
        { id: 'ride_a' } as never,
        { id: 'ride_b' } as never,
      ]);
      bookingsRepo.findActiveByRides.mockResolvedValueOnce([
        { id: 'bk_1' } as never,
        { id: 'bk_2' } as never,
      ]);
      const svc = makeService();

      await svc.cancel('trip_1', 'drv_1', { cancellationReason: 'flu' });

      expect(tripsRepo.cancel).toHaveBeenCalledWith({}, 'trip_1', 'flu');
      expect(ridesRepo.cancelMany).toHaveBeenCalledWith(
        {},
        ['ride_a', 'ride_b'],
        'flu',
      );
      expect(bookingsService.markBookingResolved).toHaveBeenNthCalledWith(
        1,
        {},
        'bk_1',
        'rejected',
      );
      expect(bookingsService.markBookingResolved).toHaveBeenNthCalledWith(
        2,
        {},
        'bk_2',
        'rejected',
      );
    });

    it('rejects cancel for a non-owner driver', async () => {
      tripsRepo.findDriverId.mockResolvedValueOnce('other');
      const svc = makeService();

      await expect(svc.cancel('trip_1', 'drv_1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(tripsRepo.cancel).not.toHaveBeenCalled();
    });

    it('rejects cancel for a trip that no longer exists', async () => {
      tripsRepo.findDriverId.mockResolvedValueOnce(null);
      const svc = makeService();

      await expect(svc.cancel('trip_1', 'drv_1', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create with externalEventContext', () => {
    const sporadicWithEvent = {
      carId: 'car_1',
      type: 'sporadic' as const,
      origin: { label: 'Mataro', lat: 41.5381, lng: 2.4445 },
      destination: { label: 'UPF', lat: 41.3888, lng: 2.1925 },
      musicAllowed: true,
      seatsOffered: 3,
      pricePerSeatCents: 500,
      departureAt: new Date('2099-01-01T08:30:00.000Z'),
      externalEventContext: { provider: 'cultucat' as const, eventId: '8421' },
    };

    it('rejects when the CultuCat event has no coordinates', async () => {
      tripsRepo.findOwnedCar.mockResolvedValueOnce({
        id: 'car_1',
        userId: 'drv_1',
      });
      cultucatService.getEventCoordinatesForTrip.mockResolvedValueOnce({
        lat: null,
        lng: null,
      });

      const svc = makeService();
      await expectErrorCode(
        svc.create('drv_1', { ...sporadicWithEvent }),
        'CULTUCAT_EVENT_NOT_FOUND',
      );
      expect(tripsRepo.insertOne).not.toHaveBeenCalled();
    });

    it('rejects when the destination is further than the configured radius', async () => {
      tripsRepo.findOwnedCar.mockResolvedValueOnce({
        id: 'car_1',
        userId: 'drv_1',
      });
      cultucatService.getEventCoordinatesForTrip.mockResolvedValueOnce({
        lat: 50,
        lng: 10,
      });

      const svc = makeService();
      await expectErrorCode(
        svc.create('drv_1', { ...sporadicWithEvent }),
        'BAD_REQUEST',
      );
    });
  });
});
