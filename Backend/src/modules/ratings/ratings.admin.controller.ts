import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { AdminRatingsQueryDto } from './dto/admin-ratings-query.dto';
import { AdminRatingListResponseDto } from './dto/rating-response.dto';
import { toRatingResponse } from './ratings.mapper';
import { RatingsService } from './ratings.service';

@ApiTags('Ratings')
@ApiCookieAuth('better-auth.session_token')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('admin/users')
export class RatingsAdminController {
  constructor(private readonly service: RatingsService) {}

  @Get(':userId/ratings')
  @Roles(['admin'])
  @ApiOperation({
    description:
      "Returns every rating received by `:userId` (newest first), with comments included. Admin role required (`role === 'admin'` on the session user via the better-auth admin plugin); non-admins get `403 FORBIDDEN`. Default page size is 20 (max 100).",
  })
  @ApiOkResponse({ type: AdminRatingListResponseDto })
  async listForUser(
    @Param('userId') userId: string,
    @Query() query: AdminRatingsQueryDto,
  ): Promise<AdminRatingListResponseDto> {
    const offset = (query.page - 1) * query.limit;
    const { items, total } = await this.service.listForRatee(userId, {
      limit: query.limit,
      offset,
    });
    return {
      items: items.map(toRatingResponse),
      page: query.page,
      limit: query.limit,
      total,
    };
  }
}
