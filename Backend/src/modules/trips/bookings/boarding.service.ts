import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { WalletService } from '@modules/wallet/wallet.service';
import { throwBadRequest } from '@shared/errors/throw';
import { BookingsRepository } from './bookings.repository';
import {
  signBoardingToken,
  verifyBoardingToken,
  windowEnd,
  windowFor,
} from './domain/boarding-token';
import type {
  BoardingScanResponseDto,
  BoardingTokenResponseDto,
} from './dto/boarding.dto';

@Injectable()
export class BoardingService {
  private readonly logger = new Logger(BoardingService.name);
  private readonly secret: string;

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly bookingsRepo: BookingsRepository,
    private readonly walletService: WalletService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('BOARDING_TOKEN_SECRET');
  }

  /**
   * Mint a fresh rotating token. Caller is the booking's passenger; the
   * booking must be `accepted` and the parent ride `in_progress` (the
   * passenger can only request the token once the driver has started
   * the ride).
   */
  async mintToken(
    passengerId: string,
    bookingId: string,
  ): Promise<BoardingTokenResponseDto> {
    return this.db.transaction(async (tx) => {
      const row = await this.bookingsRepo.findByIdWithRideAndTrip(
        tx,
        bookingId,
      );
      if (!row) {
        throw new NotFoundException('Booking not found');
      }
      if (row.booking.passengerId !== passengerId) {
        throw new ForbiddenException('Not allowed to view this booking');
      }
      if (row.booking.status !== 'accepted') {
        throwBadRequest(
          'BOARDING_TOKEN_INVALID',
          'Boarding tokens are only available for accepted bookings',
        );
      }
      if (row.ride.status !== 'in_progress') {
        throwBadRequest(
          'RIDE_NOT_IN_PROGRESS',
          'Boarding tokens are only available once the ride is in progress',
        );
      }
      const window = windowFor();
      const token = signBoardingToken({ bookingId, window }, this.secret);
      return { token, validUntil: windowEnd(window) };
    });
  }

  /**
   * Driver scans a QR. Decodes & verifies the token, validates the ride
   * is in_progress and driven by the caller, ensures the booking is
   * accepted and not already boarded, then in one tx:
   *
   *   - `captureHold(bookingId)`
   *   - `markBoardedIfUnboarded(bookingId)`
   *
   * No mutation on `bookings.status` — `boarded_at` is the authoritative
   * boarding signal per the plan.
   */
  async scan(
    driverId: string,
    token: string,
  ): Promise<BoardingScanResponseDto> {
    const payload = verifyBoardingToken(token, { secret: this.secret });
    if (!payload) {
      throwBadRequest('BOARDING_TOKEN_INVALID', 'Boarding token is invalid');
    }
    return this.db.transaction(async (tx) => {
      const row = await this.bookingsRepo.findByIdWithRideAndTrip(
        tx,
        payload.bookingId,
      );
      if (!row) {
        throw new NotFoundException('Booking referenced by token not found');
      }
      if (row.trip.driverId !== driverId) {
        throw new ForbiddenException(
          'Only the trip driver can scan boarding passes',
        );
      }
      if (row.ride.status !== 'in_progress') {
        throwBadRequest(
          'RIDE_NOT_IN_PROGRESS',
          'Boarding scans are only allowed once the ride is in progress',
        );
      }
      if (row.booking.status !== 'accepted') {
        throwBadRequest(
          'BOARDING_TOKEN_INVALID',
          'Booking is not in an accepted state',
        );
      }
      if (row.booking.boardedAt !== null) {
        throwBadRequest(
          'BOARDING_ALREADY_RECORDED',
          'This booking has already been boarded',
        );
      }

      await this.walletService.captureHold(tx, row.booking.id);
      const flipped = await this.bookingsRepo.markBoardedIfUnboarded(
        tx,
        row.booking.id,
      );
      // Race: a concurrent scan slipped through between the null-check
      // and our update. The capture is already idempotent, so the second
      // attempt was a no-op; treat this consistently as
      // BOARDING_ALREADY_RECORDED for the caller.
      if (!flipped) {
        throwBadRequest(
          'BOARDING_ALREADY_RECORDED',
          'This booking has already been boarded',
        );
      }
      const refreshed = await this.bookingsRepo.findById(tx, row.booking.id);
      if (!refreshed?.boardedAt) {
        // Defensive: we just stamped it.
        throw new Error(
          `Boarding scan: boarded_at missing after flip on ${row.booking.id}`,
        );
      }
      return {
        bookingId: row.booking.id,
        rideId: row.ride.id,
        fareCents: row.booking.fareCents ?? row.trip.pricePerSeatCents,
        boardedAt: refreshed.boardedAt,
      };
    });
  }
}
