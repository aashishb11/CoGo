import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { TripListResponseDto } from '../trips/dto/trips-response.dto';
import { MeFavoritesQueryDto } from './dto/me-favorites-query.dto';
import { FavoritesService } from './favorites.service';

@ApiTags('Favorites')
@ApiCookieAuth('better-auth.session_token')
@Controller('me/favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @ApiOperation({
    description:
      "Lists the authenticated user's favorited trips, ordered by favorite date descending. Only ACTIVE trips appear; cancelled or archived ones drop out automatically. Paginated.",
  })
  @ApiOkResponse({ type: TripListResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async listMyFavorites(
    @Session() session: UserSession,
    @Query() query: MeFavoritesQueryDto,
  ): Promise<TripListResponseDto> {
    return this.favoritesService.listMine(session.user.id, query);
  }

  @Put(':tripId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      "Adds the trip to the authenticated user's favorites. Idempotent — calling twice yields the same state. 404 if the trip doesn't exist.",
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async favorite(
    @Param('tripId') tripId: string,
    @Session() session: UserSession,
  ): Promise<void> {
    await this.favoritesService.favorite(session.user.id, tripId);
  }

  @Delete(':tripId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      "Removes the trip from the authenticated user's favorites. Idempotent — returns 204 even if the favorite didn't exist or the trip is gone.",
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async unfavorite(
    @Param('tripId') tripId: string,
    @Session() session: UserSession,
  ): Promise<void> {
    await this.favoritesService.unfavorite(session.user.id, tripId);
  }
}
