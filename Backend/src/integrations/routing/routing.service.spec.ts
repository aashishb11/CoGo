import { Test, TestingModule } from '@nestjs/testing';
import { RoutingService } from './routing.service';

const ORIGIN = { lat: 41.5381, lng: 2.4445 }; // Mataró
const DESTINATION = { lat: 41.3851, lng: 2.1734 }; // Barcelona

const mockFetch = (
  body: unknown,
  overrides: Partial<Response> = {},
): jest.SpyInstance =>
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    ...overrides,
  } as Response);

describe('RoutingService', () => {
  let service: RoutingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoutingService],
    }).compile();
    service = module.get<RoutingService>(RoutingService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('getRoute (OSRM success path)', () => {
    it('returns distance/duration/polyline derived from the OSRM response', async () => {
      mockFetch({
        code: 'Ok',
        routes: [{ distance: 12000, duration: 720, geometry: 'abc' }],
      });

      const result = await service.getRoute(ORIGIN, DESTINATION);

      expect(result.distanceKm).toBeCloseTo(12, 6);
      expect(result.durationMinutes).toBeCloseTo(12, 6);
      expect(result.polyline).toBe('abc');
    });
  });

  describe('getRoute (Haversine fallback)', () => {
    it('falls back to Haversine when OSRM responds with a non-OK status', async () => {
      mockFetch({}, { ok: false, status: 500 });

      const result = await service.getRoute(ORIGIN, DESTINATION);

      // Mataró → Barcelona great-circle distance is ~28-29 km.
      expect(result.distanceKm).toBeGreaterThan(20);
      expect(result.distanceKm).toBeLessThan(40);
      expect(result.durationMinutes).toBe(0);
      expect(result.polyline).toBeNull();
    });

    it('falls back to Haversine when OSRM response code is not "Ok"', async () => {
      mockFetch({ code: 'NoRoute', routes: [] });

      const result = await service.getRoute(ORIGIN, DESTINATION);

      expect(result.distanceKm).toBeGreaterThan(0);
      expect(result.durationMinutes).toBe(0);
      expect(result.polyline).toBeNull();
    });
  });
});
