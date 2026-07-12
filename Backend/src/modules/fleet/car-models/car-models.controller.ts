import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CarModelsService } from './car-models.service';
import { CarModelResponseDto } from './dto/car-model-response.dto';
import { CarModelsSearchResponseDto } from './dto/car-models-search-response.dto';

@ApiTags('Car models')
@Controller('car-models')
export class CarModelsController {
  constructor(private readonly carModelsService: CarModelsService) {}

  @Get('search')
  @ApiOperation({
    description:
      'Searches the catalogue of car models by free-text query (matches brand and model name). Returns paginated results with `total` for the full match count. Pass `latestYearOnly=true` to collapse each (brand, name) pair to its most recent year — useful for the car-creation autocomplete.',
  })
  @ApiOkResponse({ type: CarModelsSearchResponseDto })
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('latestYearOnly') latestYearOnly?: string,
  ): Promise<CarModelsSearchResponseDto> {
    const opts = {
      limit: parseIntOrUndefined(limit),
      offset: parseIntOrUndefined(offset),
      latestYearOnly: latestYearOnly === 'true',
    };
    const [items, total] = await Promise.all([
      this.carModelsService.search(query, opts),
      this.carModelsService.count(query, {
        latestYearOnly: opts.latestYearOnly,
      }),
    ]);
    return {
      items: items as CarModelResponseDto[],
      total,
      limit: items.length,
      offset: opts.offset ?? 0,
    };
  }
}

function parseIntOrUndefined(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
