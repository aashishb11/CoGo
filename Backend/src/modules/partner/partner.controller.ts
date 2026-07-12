import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { RideSearchQueryDto } from '@modules/trips/rides/dto/ride-search-query.dto';
import { RidesService } from '@modules/trips/rides/rides.service';
import {
  PartnerRideDto,
  PartnerRideSearchResponseDto,
} from './dto/partner-ride.dto';
import { PartnerKeyGuard } from './partner-key.guard';
import { toPartnerRide } from './partner.mapper';

// Public partner API. `@AllowAnonymous()` opts out of the global better-auth
// session guard (these consumers have no user/cookie); `PartnerKeyGuard`
// authenticates them instead via a Bearer API key.
@ApiTags('Partner')
@ApiBearerAuth('partner-key')
@ApiUnauthorizedResponse({
  type: ErrorResponseDto,
  description: 'Missing or invalid partner API key.',
})
@AllowAnonymous()
@UseGuards(PartnerKeyGuard)
@Controller('partner/v1/rides')
export class PartnerController {
  constructor(private readonly ridesService: RidesService) {}

  @Get()
  @ApiOperation({
    description:
      'Searches ACTIVE rides on a single calendar date matching origin/destination boxes (`radiusKm` around each lat/lng pair) with at least `seatsNeeded` free seats. Date is interpreted in Europe/Madrid; results are sorted by departure time ascending. The full origin/destination/date/radius set is required.',
  })
  @ApiOkResponse({ type: PartnerRideSearchResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  async searchRides(
    @Query() query: RideSearchQueryDto,
  ): Promise<PartnerRideSearchResponseDto> {
    const result = await this.ridesService.search(query);
    return {
      items: result.items.map(toPartnerRide),
      page: result.page,
      limit: result.limit,
      total: result.total,
    };
  }

  @Get(':rideId')
  @ApiOperation({
    description: 'Returns a single ride by id, with driver and trip context.',
  })
  @ApiOkResponse({ type: PartnerRideDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getRide(@Param('rideId') rideId: string): Promise<PartnerRideDto> {
    return toPartnerRide(await this.ridesService.getById(rideId));
  }
}
