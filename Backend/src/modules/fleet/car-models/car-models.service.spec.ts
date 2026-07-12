import { Test, TestingModule } from '@nestjs/testing';
import { DB } from '@core/database/database.module';
import { CarModelsRepository } from './car-models.repository';
import { CarModelsService } from './car-models.service';

type Row = {
  id: string;
  brand: string;
  name: string;
  year: number;
  type: string;
  co2KgPerKm: number;
};

describe('CarModelsService', () => {
  let service: CarModelsService;
  let repoSearch: jest.Mock;
  let repoCount: jest.Mock;

  beforeEach(async () => {
    repoSearch = jest.fn();
    repoCount = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CarModelsService,
        { provide: DB, useValue: {} },
        {
          provide: CarModelsRepository,
          useValue: { search: repoSearch, count: repoCount },
        },
      ],
    }).compile();

    service = module.get(CarModelsService);
  });

  it('returns [] for queries shorter than 2 chars without hitting the repo', async () => {
    expect(await service.search('')).toEqual([]);
    expect(await service.search('a')).toEqual([]);
    expect(repoSearch).not.toHaveBeenCalled();
  });

  it('paginates with default limit/offset', async () => {
    const rows: Row[] = [
      {
        id: '1',
        brand: 'BMW',
        name: '330i',
        year: 2024,
        type: 'sedan',
        co2KgPerKm: 0.155,
      },
    ];
    repoSearch.mockResolvedValue(rows);

    const result = await service.search('bmw');

    expect(result).toEqual(rows);
    expect(repoSearch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        query: 'bmw',
        limit: 20,
        offset: 0,
        latestYearOnly: false,
      }),
    );
  });

  it('clamps limit to MAX_LIMIT and respects offset', async () => {
    repoSearch.mockResolvedValue([]);

    await service.search('bmw', { limit: 9999, offset: 40 });

    expect(repoSearch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 50, offset: 40 }),
    );
  });

  it('forwards latestYearOnly when true', async () => {
    repoSearch.mockResolvedValue([]);

    await service.search('bmw', { latestYearOnly: true });

    expect(repoSearch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ latestYearOnly: true }),
    );
  });

  it('count returns the total match count', async () => {
    repoCount.mockResolvedValue(142);

    const total = await service.count('bmw');

    expect(total).toBe(142);
    expect(repoCount).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ query: 'bmw', latestYearOnly: false }),
    );
  });

  it('count returns 0 for short queries without hitting the repo', async () => {
    expect(await service.count('a')).toBe(0);
    expect(repoCount).not.toHaveBeenCalled();
  });
});
