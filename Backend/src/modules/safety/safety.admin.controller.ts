import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { AdminIncidentsQueryDto } from './dto/admin-incidents-query.dto';
import {
  AdminIncidentDetailDto,
  AdminIncidentListResponseDto,
} from './dto/admin-incident-detail.dto';
import {
  AdminFlaggedRideListResponseDto,
  AdminRideReviewDto,
  AdminRideReviewRideDto,
} from './dto/admin-ride-review.dto';
import {
  toAdminFlaggedRideListItem,
  toAdminIncidentDetail,
  toAdminIncidentListItem,
  toAdminRideReviewRide,
} from './incidents.mapper';
import { IncidentsService } from './incidents.service';

// Admin-only surface for moderating incidents and reviewing flagged rides.
// Tagged by domain (`Safety`) — admin gating is conveyed by `@Roles(['admin'])`
// and the `/admin/...` route prefix, not by the Swagger tag.
@ApiTags('Safety')
@ApiCookieAuth('better-auth.session_token')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Roles(['admin'])
@Controller('admin')
export class SafetyAdminController {
  constructor(private readonly service: IncidentsService) {}

  @Get('incidents')
  @ApiOperation({
    description:
      'Paginated list of every reported incident, newest first. Default page size is 20 (max 100). Admin role required.',
  })
  @ApiOkResponse({ type: AdminIncidentListResponseDto })
  async listIncidents(
    @Query() query: AdminIncidentsQueryDto,
  ): Promise<AdminIncidentListResponseDto> {
    const offset = (query.page - 1) * query.limit;
    const { items, total } = await this.service.listAllForAdmin({
      limit: query.limit,
      offset,
    });
    return {
      items: items.map(toAdminIncidentListItem),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  @Get('incidents/:id')
  @ApiOperation({
    description:
      "Returns a single incident hydrated with the ride snapshot and the reporter's identity (name, email) and role on the ride.",
  })
  @ApiOkResponse({ type: AdminIncidentDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getIncident(@Param('id') id: string): Promise<AdminIncidentDetailDto> {
    const detail = await this.service.getIncidentForAdmin(id);
    return toAdminIncidentDetail(detail);
  }

  @Get('rides/flagged')
  @ApiOperation({
    description:
      'Paginated list of rides with `flagged_for_review = true`, ordered by the most recent incident on each ride. Each item carries the incident count and the timestamp of the latest incident.',
  })
  @ApiOkResponse({ type: AdminFlaggedRideListResponseDto })
  async listFlaggedRides(
    @Query() query: AdminIncidentsQueryDto,
  ): Promise<AdminFlaggedRideListResponseDto> {
    const offset = (query.page - 1) * query.limit;
    const { items, total } = await this.service.listFlaggedRidesForAdmin({
      limit: query.limit,
      offset,
    });
    return {
      items: items.map(toAdminFlaggedRideListItem),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  @Get('rides/:rideId/review')
  @ApiOperation({
    description:
      'Returns a ride together with every incident reported on it (newest first) for admin review. Works whether or not the ride is currently flagged.',
  })
  @ApiOkResponse({ type: AdminRideReviewDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getRideReview(
    @Param('rideId') rideId: string,
  ): Promise<AdminRideReviewDto> {
    const { ride, incidents } =
      await this.service.getRideReviewForAdmin(rideId);
    return {
      ride: toAdminRideReviewRide(ride),
      incidents: incidents.map(toAdminIncidentListItem),
    };
  }

  @Patch('rides/:rideId/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Clears `flagged_for_review` on a ride. Idempotent — calling on an unflagged ride returns the same shape with `flaggedForReview: false`. Incidents are preserved.',
  })
  @ApiOkResponse({ type: AdminRideReviewRideDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async resolveRideReview(
    @Param('rideId') rideId: string,
  ): Promise<AdminRideReviewRideDto> {
    const ride = await this.service.resolveRideReview(rideId);
    return toAdminRideReviewRide(ride);
  }
}
