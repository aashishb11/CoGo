import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { BookingResponseDto } from '../bookings/dto/bookings-response.dto';
import { CancelRideDto } from './dto/cancel-ride.dto';
import { CompleteRideDto } from './dto/complete-ride.dto';
import { RideListQueryDto } from './dto/ride-list-query.dto';
import { RideSearchQueryDto } from './dto/ride-search-query.dto';
import {
  RideDetailResponseDto,
  RideListResponseDto,
  RideSearchResponseDto,
} from './dto/rides-response.dto';
import { RidesService } from './rides.service';

@ApiTags('Rides')
@ApiCookieAuth('better-auth.session_token')
@Controller()
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Get('rides')
  @ApiOperation({
    description:
      'Finds ACTIVE rides on a single calendar date matching origin/destination boxes (`radiusKm` around each lat/lng pair) with at least `seatsNeeded` free seats. Date is interpreted in Europe/Madrid; results are sorted by `scheduledDeparture` ascending and embed parent-trip metadata so the FE can deep-link to the trip and batch-book additional days. The full origin/destination/date/radius set is required — there is no unbounded ride listing.',
  })
  @ApiOkResponse({ type: RideSearchResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async searchRides(
    @Query() query: RideSearchQueryDto,
  ): Promise<RideSearchResponseDto> {
    return this.ridesService.search(query);
  }

  @Get('trips/:tripId/rides')
  @ApiOperation({
    description:
      'Lists rides materialized for a trip, ordered by `scheduledDeparture` ascending. Default window starts at now and includes statuses `active,completed`; pass `from`/`to` to widen and `status` to override. Paginated.',
  })
  @ApiOkResponse({ type: RideListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async listRides(
    @Param('tripId') tripId: string,
    @Query() query: RideListQueryDto,
  ): Promise<RideListResponseDto> {
    return this.ridesService.listForTrip(tripId, query);
  }

  @Get('rides/:rideId')
  @ApiOperation({
    description:
      'Returns a single ride with parent-trip context, driver name, and car-model brand and name. Visible to any authenticated user.',
  })
  @ApiOkResponse({ type: RideDetailResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async getRide(
    @Param('rideId') rideId: string,
  ): Promise<RideDetailResponseDto> {
    return this.ridesService.getById(rideId);
  }

  @Post('rides/:rideId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Flips a ride from ACTIVE to IN_PROGRESS and stamps `started_at`. Driver-only. Window: 30 minutes before to 2 hours after `scheduledDeparture`. Outside the window → 400 `RIDE_NOT_DEPARTED`. Wrong status → 400 `RIDE_ALREADY_STARTED`.',
  })
  @ApiOkResponse({ type: RideDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async startRide(
    @Param('rideId') rideId: string,
    @Session() session: UserSession,
  ): Promise<RideDetailResponseDto> {
    return this.ridesService.start(session.user.id, rideId);
  }

  @Post('rides/:rideId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      "Cancels a single ride instance and rejects its non-terminal bookings. Driver-only (the trip's driver). Auto-archives the parent trip if no future ACTIVE rides remain. Optional `cancellationReason` is recorded on the ride.",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async cancelRide(
    @Param('rideId') rideId: string,
    @Session() session: UserSession,
    @Body() body: CancelRideDto,
  ): Promise<void> {
    await this.ridesService.cancel(session.user.id, rideId, body);
  }

  @Post('rides/:rideId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Marks a ride as completed. Driver-only. Accepts statuses ACTIVE and IN_PROGRESS. Per-passenger settlement: bookings already scanned (`boardedAt` set) are captured (debit/earn ledger pair); unscanned bookings either receive an explicit override via `unscannedOutcomes` (`boarded` captures, `refund` releases) or fall back to the default — post-departure no-show captures, pre-departure complete (only reachable from IN_PROGRESS) releases. Freezes `actualCo2SavedKg = seatsOccupied * totalDistanceKm * carModel.co2KgPerKm`, where `seatsOccupied` is the post-loop count of bookings with `boardedAt IS NOT NULL`. Auto-archives the parent trip if no future ACTIVE rides remain. Emits `RIDE_COMPLETED`.',
  })
  @ApiOkResponse({ type: RideDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Ride is not ACTIVE.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async completeRide(
    @Param('rideId') rideId: string,
    @Session() session: UserSession,
    @Body() body: CompleteRideDto,
  ): Promise<RideDetailResponseDto> {
    return this.ridesService.complete(session.user.id, rideId, body);
  }

  @Get('rides/:rideId/bookings')
  @ApiOperation({
    description:
      'Lists every booking on a ride (any status), ordered by request time ascending. Driver-only — used in the per-ride passenger view.',
  })
  @ApiOkResponse({ type: BookingResponseDto, isArray: true })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async listRideBookings(
    @Param('rideId') rideId: string,
    @Session() session: UserSession,
  ): Promise<BookingResponseDto[]> {
    return this.ridesService.listBookings(session.user.id, rideId);
  }
}
