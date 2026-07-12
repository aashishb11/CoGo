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
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { RatingResponseDto } from './dto/rating-response.dto';
import { RatingSummaryResponseDto } from './dto/rating-summary-response.dto';
import { toRatingResponse } from './ratings.mapper';
import { RatingsService } from './ratings.service';

@ApiTags('Ratings')
@ApiCookieAuth('better-auth.session_token')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller()
export class RatingsController {
  constructor(private readonly service: RatingsService) {}

  @Post('rides/:rideId/ratings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    description:
      "Submits a rating for the counter-party on a completed ride. Direction is driver ↔ boarded passenger only. Returns `400 RATING_NOT_ELIGIBLE` with `details.reason='ride_not_completed'` when the ride isn't `completed`, and `400 RATING_NOT_ELIGIBLE` with `details.reason='not_counterparty'` when the ratee isn't the rater's counter-party (or rater rates themselves). Returns `403 FORBIDDEN` when the caller wasn't on the ride (not the driver and never boarded). Returns `409 RATING_ALREADY_SUBMITTED` on a duplicate `(ride, rater, ratee)`. `score` out-of-range is surfaced as standard `400 VALIDATION_FAILED`.",
  })
  @ApiCreatedResponse({ type: RatingResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async create(
    @Session() session: UserSession,
    @Param('rideId') rideId: string,
    @Body() body: CreateRatingDto,
  ): Promise<RatingResponseDto> {
    const row = await this.service.create(session.user.id, rideId, body);
    return toRatingResponse(row);
  }

  @Get('me/ratings/summary')
  @ApiOperation({
    description:
      'Returns the authenticated user\'s rating summary as ratee. `averageScore` is `null` (not `0`) when `count === 0` so the FE can render "no ratings yet" without a special case. `averageScore` is rounded to 2 decimals.',
  })
  @ApiOkResponse({ type: RatingSummaryResponseDto })
  async getMySummary(
    @Session() session: UserSession,
  ): Promise<RatingSummaryResponseDto> {
    return this.service.getSummaryForUser(session.user.id);
  }

  @Get('users/:userId/ratings/summary')
  @ApiOperation({
    description:
      'Returns the rating summary for any user. Authenticated read; no role gate. Same shape as `/me/ratings/summary`.',
  })
  @ApiOkResponse({ type: RatingSummaryResponseDto })
  async getSummaryByUserId(
    @Param('userId') userId: string,
  ): Promise<RatingSummaryResponseDto> {
    return this.service.getSummaryForUser(userId);
  }
}
