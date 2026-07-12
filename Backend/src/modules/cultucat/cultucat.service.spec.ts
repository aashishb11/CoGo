import {
  BadGatewayException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  CultucatClientError,
  CultucatClientService,
} from '@integrations/cultucat/cultucat-client.service';
import { CULTUCAT_PROVIDER } from '@shared/external-events/external-event.types';
import { CultucatService } from './cultucat.service';

const EVENT = {
  id: 8421,
  externalId: 'EV-12345',
  title: 'Spring Festival',
  subtitle: 'Special Edition',
  description: 'Cultural show with activities throughout the weekend.',
  startDate: '2026-05-10T18:00:00.000Z',
  endDate: '2026-05-10T22:00:00.000Z',
  schedule: 'From 18:00 to 22:00',
  activityUrl: 'https://cultucat.example/activity',
  ticketsUrl: 'https://cultucat.example/tickets',
  minPrice: 0,
  maxPrice: 0,
  priceInfo: 'Free admission',
  modality: 'In-person',
  imageUrl: 'https://cultucat.example/image.jpg',
  comarca: 'Barcelonès',
  municipi: 'Barcelona',
  location: 'Parc del Forum',
  lat: 41.4121,
  lng: 2.2194,
  externalCreatedAt: '2026-04-20T09:30:00.000Z',
  createdAt: '2026-04-21T10:00:00.000Z',
  updatedAt: '2026-04-21T12:00:00.000Z',
  ambits: [{ id: 1, name: 'Music' }],
  categories: [{ id: 5, name: 'Festival' }],
};

const SEARCH_RESPONSE = {
  status: 'success',
  message: 'Events retrieved successfully',
  data: [EVENT],
  meta: { total: 247, page: 1, limit: 20, hasMore: false },
};

describe('CultucatService', () => {
  let service: CultucatService;
  let searchEvents: jest.Mock;
  let getEventById: jest.Mock;

  beforeEach(async () => {
    searchEvents = jest.fn();
    getEventById = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CultucatService,
        {
          provide: CultucatClientService,
          useValue: { searchEvents, getEventById },
        },
      ],
    }).compile();

    service = module.get(CultucatService);
  });

  const getCode = (error: {
    getResponse(): string | object;
  }): string | undefined => {
    const response = error.getResponse();
    return typeof response === 'object' && response !== null
      ? (response as { code?: string }).code
      : undefined;
  };

  describe('listEvents', () => {
    it('maps coordinate queries to the upstream POST body and computes distance', async () => {
      searchEvents.mockResolvedValue(SEARCH_RESPONSE);

      const result = await service.listEvents({
        dateFrom: new Date('2026-05-01T00:00:00.000Z'),
        dateTo: new Date('2026-05-31T23:59:59.000Z'),
        lat: 41.3874,
        lng: 2.1686,
        radiusKm: 15,
        page: 1,
      });

      expect(searchEvents).toHaveBeenCalledWith({
        dateFrom: '2026-05-01T00:00:00.000Z',
        dateTo: '2026-05-31T23:59:59.000Z',
        location: {
          mode: 'coordinates',
          lat: 41.3874,
          lng: 2.1686,
          radiusKm: 15,
        },
        page: 1,
      });
      expect(result).toMatchObject({
        page: 1,
        limit: 20,
        total: 247,
        hasMore: false,
      });
      expect(result.items[0]).toMatchObject({
        eventId: '8421',
        externalId: 'EV-12345',
        title: 'Spring Festival',
        region: 'Barcelonès',
        municipality: 'Barcelona',
        externalEventContext: { provider: CULTUCAT_PROVIDER, eventId: '8421' },
      });
      expect(result.items[0].distanceFromOriginKm).toBeGreaterThan(0);
    });

    it('maps municipality queries to the municipi upstream POST body', async () => {
      searchEvents.mockResolvedValue({ ...SEARCH_RESPONSE, data: [] });

      await service.listEvents({
        dateFrom: new Date('2026-05-01T00:00:00.000Z'),
        dateTo: new Date('2026-05-31T23:59:59.000Z'),
        municipality: 'Barcelona',
        page: 2,
      });

      expect(searchEvents).toHaveBeenCalledWith({
        dateFrom: '2026-05-01T00:00:00.000Z',
        dateTo: '2026-05-31T23:59:59.000Z',
        location: { mode: 'municipi', municipi: 'Barcelona' },
        page: 2,
      });
    });

    it('maps CultuCat 400 errors to 502 Bad Gateway', async () => {
      searchEvents.mockRejectedValue(
        new CultucatClientError('bad_request', 'Validation failed', {
          errors: { fieldErrors: { location: ['invalid'] } },
        }),
      );

      const query = {
        dateFrom: new Date('2026-05-01T00:00:00.000Z'),
        dateTo: new Date('2026-05-31T23:59:59.000Z'),
        municipality: 'Barcelona',
        page: 1,
      };

      await expect(service.listEvents(query)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      try {
        await service.listEvents(query);
      } catch (error) {
        expect(getCode(error as BadGatewayException)).toBe('BAD_GATEWAY');
      }
    });

    it('maps CultuCat 401 errors to 500 internal server error', async () => {
      searchEvents.mockRejectedValue(
        new CultucatClientError('unauthorized', 'Unauthorized'),
      );

      await expect(
        service.listEvents({
          dateFrom: new Date('2026-05-01T00:00:00.000Z'),
          dateTo: new Date('2026-05-31T23:59:59.000Z'),
          municipality: 'Barcelona',
          page: 1,
        }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('maps CultuCat 500 errors to 502 Bad Gateway', async () => {
      searchEvents.mockRejectedValue(
        new CultucatClientError('upstream', 'HTTP 500'),
      );

      await expect(
        service.listEvents({
          dateFrom: new Date('2026-05-01T00:00:00.000Z'),
          dateTo: new Date('2026-05-31T23:59:59.000Z'),
          municipality: 'Barcelona',
          page: 1,
        }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('maps CultuCat timeouts to 503 Service Unavailable', async () => {
      searchEvents.mockRejectedValue(
        new CultucatClientError('timeout', 'Timed out'),
      );

      await expect(
        service.listEvents({
          dateFrom: new Date('2026-05-01T00:00:00.000Z'),
          dateTo: new Date('2026-05-31T23:59:59.000Z'),
          municipality: 'Barcelona',
          page: 1,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('getEventById', () => {
    it('fetches the event live and maps it to the response DTO', async () => {
      getEventById.mockResolvedValue(EVENT);

      const result = await service.getEventById(8421, {
        originLat: 41.3874,
        originLng: 2.1686,
      });

      expect(getEventById).toHaveBeenCalledWith(8421);
      expect(result).toMatchObject({
        eventId: '8421',
        title: 'Spring Festival',
        externalEventContext: { provider: CULTUCAT_PROVIDER, eventId: '8421' },
      });
      expect(result.distanceFromOriginKm).toBeGreaterThan(0);
    });

    it('coerces CultuCat string coordinates into numeric lat/lng', async () => {
      getEventById.mockResolvedValue({
        ...EVENT,
        lat: '41.40362990',
        lng: '2.17435580',
      });

      const result = await service.getEventById(8421, {
        originLat: 41.3874,
        originLng: 2.1686,
      });

      expect(result.lat).toBeCloseTo(41.4036299);
      expect(result.lng).toBeCloseTo(2.1743558);
      expect(result.distanceFromOriginKm).toBeGreaterThan(0);
    });

    it('resolves a relative CultuCat imageUrl to an absolute URL', async () => {
      getEventById.mockResolvedValue({
        ...EVENT,
        imageUrl: '/content/dam/agenda/ca/activitats/x.jpg',
      });

      const result = await service.getEventById(8421, {});

      expect(result.imageUrl).toBe(
        'https://agenda.cultura.gencat.cat/content/dam/agenda/ca/activitats/x.jpg',
      );
    });

    it('leaves an already-absolute imageUrl unchanged', async () => {
      getEventById.mockResolvedValue({
        ...EVENT,
        imageUrl: 'https://cdn.example/poster.jpg',
      });

      const result = await service.getEventById(8421, {});

      expect(result.imageUrl).toBe('https://cdn.example/poster.jpg');
    });

    it('translates a client not_found into 404 CULTUCAT_EVENT_NOT_FOUND', async () => {
      expect.assertions(2);
      getEventById.mockRejectedValue(
        new CultucatClientError('not_found', 'No event'),
      );

      try {
        await service.getEventById(9999, {});
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(getCode(error as NotFoundException)).toBe(
          'CULTUCAT_EVENT_NOT_FOUND',
        );
      }
    });

    it('maps a client timeout to 503 Service Unavailable', async () => {
      getEventById.mockRejectedValue(
        new CultucatClientError('timeout', 'Timed out'),
      );

      await expect(service.getEventById(8421, {})).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('getEventCoordinatesForTrip', () => {
    it('returns the event coordinates when the event exists', async () => {
      getEventById.mockResolvedValue(EVENT);

      await expect(service.getEventCoordinatesForTrip(8421)).resolves.toEqual({
        lat: 41.4121,
        lng: 2.2194,
      });
    });

    it('coerces string coordinates from CultuCat into numbers', async () => {
      getEventById.mockResolvedValue({
        ...EVENT,
        lat: '41.40362990',
        lng: '2.17435580',
      });

      await expect(service.getEventCoordinatesForTrip(8421)).resolves.toEqual({
        lat: 41.4036299,
        lng: 2.1743558,
      });
    });

    it('throws 404 CULTUCAT_EVENT_NOT_FOUND when the event does not exist', async () => {
      expect.assertions(2);
      getEventById.mockRejectedValue(
        new CultucatClientError('not_found', 'No event'),
      );

      try {
        await service.getEventCoordinatesForTrip(9999);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(getCode(error as NotFoundException)).toBe(
          'CULTUCAT_EVENT_NOT_FOUND',
        );
      }
    });

    it('throws 503 Service Unavailable when CultuCat is unreachable', async () => {
      getEventById.mockRejectedValue(
        new CultucatClientError('network', 'unreachable'),
      );

      await expect(
        service.getEventCoordinatesForTrip(8421),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('throws 503 Service Unavailable on an upstream 5xx', async () => {
      getEventById.mockRejectedValue(
        new CultucatClientError('upstream', 'HTTP 500'),
      );

      await expect(
        service.getEventCoordinatesForTrip(8421),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
