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
import { BookingsService } from './bookings.service';
import { AcceptBookingsDto } from './dto/accept-bookings.dto';
import {
  BookingListResponseDto,
  BookingResponseDto,
  BookingsBatchCreatedResponseDto,
  BookingsBatchOutcomeDto,
  InboxResponseDto,
} from './dto/bookings-response.dto';
import { CancelMyBookingsDto } from './dto/cancel-my-bookings.dto';
import { CreateBookingsDto } from './dto/create-bookings.dto';
import { MeBookingsQueryDto } from './dto/me-bookings-query.dto';
import { MeInboxQueryDto } from './dto/me-inbox-query.dto';
import {
  RejectAllBookingsDto,
  RejectBookingsDto,
} from './dto/reject-bookings.dto';

@ApiTags('Bookings')
@ApiCookieAuth('better-auth.session_token')
@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // ── Passenger-facing ────────────────────────────────────────────────────

  @Post('trips/:tripId/bookings')
  @ApiOperation({
    description:
      'Creates one or more booking requests for the authenticated passenger across the given rides of a trip. Atomic — either every booking inserts or none do. The driver of the trip cannot book their own rides, and each ride must be active with `scheduledDeparture` in the future. Returns 409 if an active booking (pending or accepted) already exists for the same passenger on any of the requested rides.',
  })
  @ApiCreatedResponse({ type: BookingsBatchCreatedResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'An active booking (PENDING or ACCEPTED) already exists for one of the requested rides.',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async createBookings(
    @Param('tripId') tripId: string,
    @Session() session: UserSession,
    @Body() body: CreateBookingsDto,
  ): Promise<BookingsBatchCreatedResponseDto> {
    return this.bookingsService.createBatch(session.user.id, tripId, body);
  }

  @Get('me/bookings')
  @ApiOperation({
    description:
      "Lists the authenticated passenger's bookings, ordered by request time descending. Optional filters: `tripId` to scope to one batch, `status` (multi-valued) to filter by booking status, and `from`/`to` to bound by ride departure. Paginated.",
  })
  @ApiOkResponse({ type: BookingListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async listMyBookings(
    @Session() session: UserSession,
    @Query() query: MeBookingsQueryDto,
  ): Promise<BookingListResponseDto> {
    return this.bookingsService.listMine(session.user.id, query);
  }

  @Get('bookings/:bookingId')
  @ApiOperation({
    description:
      "Returns a single booking. Visible to the booking's passenger or to the trip's driver; everyone else gets 403.",
  })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async getBooking(
    @Param('bookingId') bookingId: string,
    @Session() session: UserSession,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.getOne(session.user.id, bookingId);
  }

  @Post('bookings/:bookingId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      "Cancels one of the authenticated passenger's bookings. Idempotent — terminal-state bookings are no-ops. If the booking was accepted, decrements `seatsOccupied` on the ride. Passenger-only (the booking's owner).",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async cancelBooking(
    @Param('bookingId') bookingId: string,
    @Session() session: UserSession,
  ): Promise<void> {
    await this.bookingsService.cancelOne(session.user.id, bookingId);
  }

  @Post('me/bookings/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      'Cancels every non-terminal booking the authenticated passenger has on the given trip in one call. Idempotent — no-op if the passenger has no active bookings on the trip. Decrements `seatsOccupied` on each ride where a previously accepted booking is dropped.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async cancelMyBookings(
    @Session() session: UserSession,
    @Body() body: CancelMyBookingsDto,
  ): Promise<void> {
    await this.bookingsService.cancelMineOnTrip(session.user.id, body.tripId);
  }

  // ── Driver-facing ───────────────────────────────────────────────────────

  @Get('me/inbox')
  @ApiOperation({
    description:
      'Driver inbox: every (trip, passenger) batch with at least one non-terminal booking on a trip the authenticated user drives. Pending-first (oldest at the top), then accepted-only batches. Each item carries the trip header (origin/destination labels, type), passenger summary (id, name, avatar), the bookings in the batch ordered by ride departure ascending, plus `pendingCount` / `acceptedCount` / `oldestPendingAt`. Filter with `?tripId=` to scope to one trip or `?passengerId=` to scope to one passenger. Use the `POST /trips/:tripId/bookings/{accept,reject}` endpoints to act on a card.',
  })
  @ApiOkResponse({ type: InboxResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async listMyInbox(
    @Session() session: UserSession,
    @Query() query: MeInboxQueryDto,
  ): Promise<InboxResponseDto> {
    return this.bookingsService.listMyInbox(session.user.id, query);
  }

  @Post('trips/:tripId/bookings/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      "Accepts a batch of pending bookings from one passenger on the trip; the passenger is named in the body. Omit `bookingIds` to act on every pending booking in that passenger's batch. Driver-only. Per-booking outcomes are reported via the `accepted` and `skipped` arrays; skip reasons are `ALREADY_TERMINAL` (booking no longer pending), `RIDE_DEPARTED` (ride past its scheduled departure or no longer active), and `RIDE_FULL` (ride at capacity).",
  })
  @ApiOkResponse({ type: BookingsBatchOutcomeDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async acceptBookings(
    @Param('tripId') tripId: string,
    @Session() session: UserSession,
    @Body() body: AcceptBookingsDto,
  ): Promise<BookingsBatchOutcomeDto> {
    return this.bookingsService.accept(
      session.user.id,
      tripId,
      body.passengerId,
      body,
    );
  }

  @Post('trips/:tripId/bookings/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      "Rejects a batch of pending or accepted bookings from one passenger on the trip; the passenger is named in the body. Omit `bookingIds` to act on every non-terminal booking in that passenger's batch. Driver-only. Decrements `seatsOccupied` for each previously accepted booking. Already-terminal bookings are reported under `skipped` with reason `ALREADY_TERMINAL`.",
  })
  @ApiOkResponse({ type: BookingsBatchOutcomeDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async rejectBookings(
    @Param('tripId') tripId: string,
    @Session() session: UserSession,
    @Body() body: RejectBookingsDto,
  ): Promise<BookingsBatchOutcomeDto> {
    return this.bookingsService.reject(
      session.user.id,
      tripId,
      body.passengerId,
      body,
    );
  }

  @Post('trips/:tripId/bookings/reject-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      "Rejects every pending and accepted booking across the trip's future ACTIVE rides in a single call. Driver-only. Used to unblock a sensitive trip edit that was rejected with `ACTIVE_BOOKINGS_PRESENT`. Decrements `seatsOccupied` on each ride with previously accepted bookings.",
  })
  @ApiOkResponse({ type: BookingsBatchOutcomeDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async rejectAllBookings(
    @Param('tripId') tripId: string,
    @Session() session: UserSession,
    @Body() body: RejectAllBookingsDto,
  ): Promise<BookingsBatchOutcomeDto> {
    return this.bookingsService.rejectAll(session.user.id, tripId, body);
  }
}
