import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
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
import { ActiveBookingsPresentErrorDto } from './dto/active-bookings-present-error.dto';
import { CancelTripDto } from './dto/cancel-trip.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { MeTripsQueryDto } from './dto/me-trips-query.dto';
import {
  TripDetailResponseDto,
  TripListResponseDto,
} from './dto/trips-response.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripsService } from './trips.service';

@ApiTags('Trips')
@ApiCookieAuth('better-auth.session_token')
@Controller()
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post('trips')
  @ApiOperation({
    description:
      "Creates a new trip for the authenticated driver. Sporadic trips materialize a single ride at `departureAt`; recurring trips materialize one ride per matching weekday in the `[startDate, endDate]` window. The trip's car must belong to the requester. Route distance, duration, and polyline are computed server-side from the origin/destination coordinates.",
  })
  @ApiCreatedResponse({ type: TripDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async createTrip(
    @Session() session: UserSession,
    @Body() body: CreateTripDto,
  ): Promise<TripDetailResponseDto> {
    return this.tripsService.create(session.user.id, body);
  }

  @Get('me/trips')
  @ApiOperation({
    description:
      'Lists trips where the authenticated user is the driver, ordered by creation date descending. Default `?status` filter is `active,cancelled` (archived trips hidden); pass an explicit list to include `archived`. Paginated via `page` and `limit`.',
  })
  @ApiOkResponse({ type: TripListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async listMyTrips(
    @Session() session: UserSession,
    @Query() query: MeTripsQueryDto,
  ): Promise<TripListResponseDto> {
    return this.tripsService.listMine(session.user.id, query);
  }

  @Get('trips/:tripId')
  @ApiOperation({
    description:
      'Returns a single trip with full driver and route details. Visible to any authenticated user — passenger discovery flows rely on this to show the trip context after a ride search hit.',
  })
  @ApiOkResponse({ type: TripDetailResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async getTrip(
    @Param('tripId') tripId: string,
  ): Promise<TripDetailResponseDto> {
    return this.tripsService.getById(tripId);
  }

  @Patch('trips/:tripId')
  @ApiOperation({
    description:
      'Updates a trip. Driver-only. Sensitive fields (origin, destination, seatsOffered, carId) re-snapshot all future ACTIVE rides; if any has a pending or accepted booking, returns 409 with code `ACTIVE_BOOKINGS_PRESENT` and the blocking ride IDs. Non-sensitive fields (music, smoke, conversation) update only the trip row. Schedule fields (departureAt, schedule, startDate, endDate) are immutable — cancel and recreate to change them.',
  })
  @ApiOkResponse({ type: TripDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ActiveBookingsPresentErrorDto,
    description:
      'Sensitive fields (origin, destination, seatsOffered, carId) cannot be edited while any future ACTIVE ride has a non-terminal booking.',
  })
  async updateTrip(
    @Param('tripId') tripId: string,
    @Session() session: UserSession,
    @Body() body: UpdateTripDto,
  ): Promise<TripDetailResponseDto> {
    return this.tripsService.update(tripId, session.user.id, body);
  }

  @Post('trips/:tripId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      'Cancels a trip and cascades to all of its future ACTIVE rides and their non-terminal bookings (pending and accepted become rejected). Driver-only. Past rides and their bookings are untouched. Optional `cancellationReason` is recorded on the trip.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async cancelTrip(
    @Param('tripId') tripId: string,
    @Session() session: UserSession,
    @Body() body: CancelTripDto,
  ): Promise<void> {
    await this.tripsService.cancel(tripId, session.user.id, body);
  }
}
