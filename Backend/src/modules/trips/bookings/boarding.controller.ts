import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { BoardingService } from './boarding.service';
import {
  BoardingScanRequestDto,
  BoardingScanResponseDto,
  BoardingTokenResponseDto,
} from './dto/boarding.dto';

@ApiTags('Boarding')
@ApiCookieAuth('better-auth.session_token')
@Controller()
export class BoardingController {
  constructor(private readonly boardingService: BoardingService) {}

  @Get('me/bookings/:bookingId/boarding-token')
  @ApiOperation({
    description:
      'Returns a rotating HMAC-signed boarding token for the authenticated passenger. The token rotates every ~30 seconds (the server accepts one slot of skew). Booking must be accepted and the parent ride must be IN_PROGRESS; otherwise 400 with a precise code. The FE polls before `validUntil`.',
  })
  @ApiOkResponse({ type: BoardingTokenResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async getBoardingToken(
    @Param('bookingId') bookingId: string,
    @Session() session: UserSession,
  ): Promise<BoardingTokenResponseDto> {
    return this.boardingService.mintToken(session.user.id, bookingId);
  }

  @Post('boarding-scans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      "Driver-side endpoint: decode a passenger's boarding token, capture the held fare (writes the `payment` / `earning` ledger pair), and stamp `boarded_at` on the booking. The token pins the booking which pins the ride — no `:rideId` in the path. 400 `BOARDING_TOKEN_INVALID` for a bad/expired token; 400 `BOARDING_ALREADY_RECORDED` for a replay; 400 `RIDE_NOT_IN_PROGRESS` outside the IN_PROGRESS window; 403 if the caller is not the trip driver.",
  })
  @ApiOkResponse({ type: BoardingScanResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async scanBoarding(
    @Session() session: UserSession,
    @Body() body: BoardingScanRequestDto,
  ): Promise<BoardingScanResponseDto> {
    return this.boardingService.scan(session.user.id, body.token);
  }
}
