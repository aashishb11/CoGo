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
import { CreateIncidentDto } from './dto/create-incident.dto';
import {
  IncidentListResponseDto,
  IncidentResponseDto,
} from './dto/incident-response.dto';
import { IncidentsQueryDto } from './dto/incidents-query.dto';
import { toIncidentResponse } from './incidents.mapper';
import { IncidentsService } from './incidents.service';

@ApiTags('Safety')
@ApiCookieAuth('better-auth.session_token')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller()
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Post('rides/:rideId/incidents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    description:
      "Reports a safety incident on a ride. Reporter must be the trip driver or a passenger whose booking on that ride has `boarded_at IS NOT NULL`. Ride must be `in_progress` or completed within the last 24 hours; otherwise `400 INCIDENT_WINDOW_CLOSED`. Submitting also flips `rides.flagged_for_review` and dispatches an email to the reporter's trusted contact (failures isolated post-commit).",
  })
  @ApiCreatedResponse({ type: IncidentResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async create(
    @Session() session: UserSession,
    @Param('rideId') rideId: string,
    @Body() body: CreateIncidentDto,
  ): Promise<IncidentResponseDto> {
    const row = await this.service.create(session.user.id, rideId, body);
    return toIncidentResponse(row);
  }

  @Get('me/incidents')
  @ApiOperation({
    description:
      'Paginated list of incidents reported by the authenticated user, newest first. Default page size is 20 (max 100).',
  })
  @ApiOkResponse({ type: IncidentListResponseDto })
  async listMine(
    @Session() session: UserSession,
    @Query() query: IncidentsQueryDto,
  ): Promise<IncidentListResponseDto> {
    const offset = (query.page - 1) * query.limit;
    const { items, total } = await this.service.listMine(session.user.id, {
      limit: query.limit,
      offset,
    });
    return {
      items: items.map(toIncidentResponse),
      page: query.page,
      limit: query.limit,
      total,
    };
  }
}
