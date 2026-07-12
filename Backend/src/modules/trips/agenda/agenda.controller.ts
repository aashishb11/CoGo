import { Controller, Get, Header, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { AgendaService } from './agenda.service';
import { AgendaResponseDto } from './dto/agenda-response.dto';
import { AgendaFeedResponseDto } from './dto/agenda-feed-response.dto';
import { MeAgendaQueryDto } from './dto/me-agenda-query.dto';

@ApiTags('Agenda')
@ApiCookieAuth('better-auth.session_token')
@Controller()
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Get('me/agenda')
  @ApiOperation({
    description:
      "Returns the authenticated user's upcoming rides as both driver and passenger, merged and sorted by `scheduledDeparture` ascending. Default window: now to now+30d (override with `from`/`to`). Passenger rows include driver and car details and `myBookingStatus`; driver rows include `pendingBookingCount` and seat occupancy. Filter via `?bookingStatus=pending,accepted` (default both); driver rows are unaffected by this filter.",
  })
  @ApiOkResponse({ type: AgendaResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async listMyAgenda(
    @Session() session: UserSession,
    @Query() query: MeAgendaQueryDto,
  ): Promise<AgendaResponseDto> {
    return this.agendaService.listMine(session.user.id, query);
  }

  @Get('me/agenda/feed')
  @ApiOperation({
    description:
      "Returns the authenticated user's iCalendar feed URL, minting the feed token on first call. Hand this URL to a calendar app (Google Calendar, Apple Calendar) to subscribe. Note that Google polls subscribed URLs only every 12-24h, so changes take a while to appear.",
  })
  @ApiOkResponse({ type: AgendaFeedResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async getMyAgendaFeed(
    @Session() session: UserSession,
  ): Promise<AgendaFeedResponseDto> {
    const token = await this.agendaService.getOrCreateFeedToken(
      session.user.id,
    );
    return { url: this.agendaService.buildFeedUrl(token) };
  }

  @Post('me/agenda/feed/rotate')
  @ApiOperation({
    description:
      'Rotates the feed token, revoking the previous feed URL, and returns the new one. Use this if the feed URL leaks.',
  })
  @ApiOkResponse({ type: AgendaFeedResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async rotateMyAgendaFeed(
    @Session() session: UserSession,
  ): Promise<AgendaFeedResponseDto> {
    const token = await this.agendaService.rotateFeedToken(session.user.id);
    return { url: this.agendaService.buildFeedUrl(token) };
  }

  @Get('me/agenda.ics')
  @AllowAnonymous()
  @ApiOperation({
    description:
      "iCalendar (.ics) feed of the user's rides, authenticated by the `token` query param (not the session cookie) so external calendar services can poll it. Window: now-7d to now+90d. Returns `text/calendar`. Unknown token → 401.",
  })
  @ApiQuery({ name: 'token', required: true })
  @ApiProduces('text/calendar')
  @ApiOkResponse({ schema: { type: 'string' } })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async getMyAgendaIcs(@Query('token') token: string): Promise<string> {
    return this.agendaService.buildIcsForToken(token ?? '');
  }
}
