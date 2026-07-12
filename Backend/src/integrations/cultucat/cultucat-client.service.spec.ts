import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { CultucatClientService } from './cultucat-client.service';

const MOCK_CONFIG: Record<string, string | number> = {
  CULTUCAT_API_BASE_URL: 'https://cultucat.example',
  CULTUCAT_EVENTS_PATH: '/external/events',
  CULTUCAT_API_KEY: 'test-api-key',
  CULTUCAT_TIMEOUT_MS: 50,
};

const SEARCH_BODY = {
  dateFrom: '2026-05-01T00:00:00.000Z',
  dateTo: '2026-05-31T23:59:59.000Z',
  location: {
    mode: 'municipi' as const,
    municipi: 'Barcelona',
  },
  page: 1,
};

const EVENT = {
  id: 8421,
  externalId: 'EV-12345',
  title: 'Festival de Primavera',
  comarca: 'Barcelonès',
  municipi: 'Barcelona',
  location: 'Parc del Fòrum',
  lat: 41.4121,
  lng: 2.2194,
  ambits: [{ id: 1, name: 'Música' }],
  categories: [{ id: 5, name: 'Festival' }],
};

describe('CultucatClientService', () => {
  let service: CultucatClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CultucatClientService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const value = MOCK_CONFIG[key];
              if (value === undefined) {
                throw new Error(`Missing config: ${key}`);
              }
              return value;
            },
            get: (key: string) => MOCK_CONFIG[key],
          },
        },
      ],
    }).compile();

    service = module.get(CultucatClientService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('searchEvents', () => {
    it('sends the POST request to the configured CultuCat URL with the API key header', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: 'success',
            message: 'ok',
            data: [],
            meta: { total: 0, page: 1, limit: 20, hasMore: false },
          }),
      } as Response);

      await service.searchEvents(SEARCH_BODY);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://cultucat.example/external/events',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': 'test-api-key',
          },
        }),
      );
    });

    it('returns the parsed data/meta response shape', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: 'success',
            message: 'ok',
            data: [EVENT],
            meta: { total: 1, page: 1, limit: 20, hasMore: false },
          }),
      } as Response);

      const response = await service.searchEvents(SEARCH_BODY);

      expect(response.data).toHaveLength(1);
      expect(response.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      });
    });

    it('rejects a malformed response that lacks data/meta', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'success', date: [], goal: {} }),
      } as Response);

      await expect(service.searchEvents(SEARCH_BODY)).rejects.toMatchObject({
        kind: 'upstream',
      });
    });

    it('maps upstream 400 responses to a bad_request client error', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Validation failed' }),
      } as Response);

      await expect(service.searchEvents(SEARCH_BODY)).rejects.toMatchObject({
        kind: 'bad_request',
      });
    });

    it('maps upstream 401 responses to an unauthorized client error', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      } as Response);

      await expect(service.searchEvents(SEARCH_BODY)).rejects.toMatchObject({
        kind: 'unauthorized',
      });
    });

    it('maps request timeouts to a timeout client error', async () => {
      jest.useFakeTimers();
      jest.spyOn(global, 'fetch').mockImplementation(
        (_input, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      );

      const promise = service.searchEvents(SEARCH_BODY);
      jest.advanceTimersByTime(50);

      await expect(promise).rejects.toMatchObject({ kind: 'timeout' });
    });
  });

  describe('getEventById', () => {
    it('sends a GET request to the events path plus the numeric id', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ status: 'success', message: 'ok', data: EVENT }),
      } as Response);

      const event = await service.getEventById(8421);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://cultucat.example/external/events/8421',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'content-type': 'application/json',
            'x-api-key': 'test-api-key',
          },
        }),
      );
      expect(event).toMatchObject({ id: 8421, externalId: 'EV-12345' });
    });

    it('maps upstream 404 responses to a not_found client error', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not found' }),
      } as Response);

      await expect(service.getEventById(9999)).rejects.toMatchObject({
        kind: 'not_found',
      });
    });

    it('maps upstream 500 responses to an upstream client error', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Server error' }),
      } as Response);

      await expect(service.getEventById(8421)).rejects.toMatchObject({
        kind: 'upstream',
      });
    });

    it('maps request timeouts to a timeout client error', async () => {
      jest.useFakeTimers();
      jest.spyOn(global, 'fetch').mockImplementation(
        (_input, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      );

      const promise = service.getEventById(8421);
      jest.advanceTimersByTime(50);

      await expect(promise).rejects.toMatchObject({ kind: 'timeout' });
    });
  });
});
