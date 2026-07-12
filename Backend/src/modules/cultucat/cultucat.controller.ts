import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { CultucatService } from './cultucat.service';
import { CultucatEventDetailQueryDto } from './dto/cultucat-event-detail-query.dto';
import {
  CultucatEventListResponseDto,
  CultucatEventResponseDto,
} from './dto/cultucat-events-response.dto';
import { ListCultucatEventsQueryDto } from './dto/list-cultucat-events-query.dto';

@ApiTags('CultuCat')
@ApiCookieAuth('better-auth.session_token')
@Controller()
export class CultucatController {
  constructor(private readonly cultucatService: CultucatService) {}

  @Get('cultucat/events')
  @ApiOperation({
    description:
      'Searches CultuCat events live using either a coordinate radius or a municipality name. CoGo proxies the upstream POST contract behind this GET endpoint; no events are cached.',
  })
  @ApiOkResponse({ type: CultucatEventListResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 502, type: ErrorResponseDto })
  @ApiResponse({ status: 503, type: ErrorResponseDto })
  async listEvents(
    @Query() query: ListCultucatEventsQueryDto,
  ): Promise<CultucatEventListResponseDto> {
    return this.cultucatService.listEvents(query);
  }

  @Get('cultucat/events/:eventId')
  @ApiOperation({
    description:
      'Returns a CultuCat event by its numeric id. Proxies the upstream detail endpoint live; no events are cached.',
  })
  @ApiParam({
    name: 'eventId',
    type: Number,
    description: "CultuCat's numeric event id (a positive integer).",
  })
  @ApiQuery({
    name: 'originLat',
    required: false,
    type: Number,
    description:
      'Optional origin latitude used to compute distanceFromOriginKm in the response.',
  })
  @ApiQuery({
    name: 'originLng',
    required: false,
    type: Number,
    description:
      'Optional origin longitude used to compute distanceFromOriginKm in the response.',
  })
  @ApiOkResponse({ type: CultucatEventResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async getEventById(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() query: CultucatEventDetailQueryDto,
  ): Promise<CultucatEventResponseDto> {
    return this.cultucatService.getEventById(eventId, query);
  }
}
