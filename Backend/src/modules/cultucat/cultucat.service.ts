import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CultucatClientError,
  CultucatClientService,
} from '@integrations/cultucat/cultucat-client.service';
import { throwNotFound } from '@shared/errors/throw';
import { toCultucatEventResponse, toNullableNumber } from './cultucat.mapper';
import type {
  CultucatEventListResponseDto,
  CultucatEventResponseDto,
} from './dto/cultucat-events-response.dto';
import type { CultucatEventDetailQueryDto } from './dto/cultucat-event-detail-query.dto';
import type { ListCultucatEventsQueryDto } from './dto/list-cultucat-events-query.dto';
import type {
  CultucatEventPayload,
  CultucatSearchRequest,
} from './cultucat.types';

@Injectable()
export class CultucatService {
  private readonly logger = new Logger(CultucatService.name);

  constructor(private readonly client: CultucatClientService) {}

  async listEvents(
    query: ListCultucatEventsQueryDto,
  ): Promise<CultucatEventListResponseDto> {
    try {
      const response = await this.client.searchEvents(
        this.buildSearchRequest(query),
      );

      const origin =
        query.lat !== undefined && query.lng !== undefined
          ? { lat: query.lat, lng: query.lng }
          : undefined;

      return {
        items: response.data.map((event) =>
          toCultucatEventResponse(event, { origin }),
        ),
        page: response.meta.page,
        limit: response.meta.limit,
        total: response.meta.total,
        hasMore: response.meta.hasMore,
      };
    } catch (error) {
      this.rethrowClientError(error, 'CultuCat events could not be loaded.');
    }
  }

  async getEventById(
    eventId: number,
    query: CultucatEventDetailQueryDto,
  ): Promise<CultucatEventResponseDto> {
    let event: CultucatEventPayload;
    try {
      event = await this.client.getEventById(eventId);
    } catch (error) {
      if (error instanceof CultucatClientError && error.kind === 'not_found') {
        throwNotFound(
          'CULTUCAT_EVENT_NOT_FOUND',
          'CultuCat event could not be found or no longer exists.',
        );
      }
      this.rethrowClientError(error, 'CultuCat event could not be loaded.');
    }

    const origin =
      query.originLat !== undefined && query.originLng !== undefined
        ? { lat: query.originLat, lng: query.originLng }
        : undefined;

    return toCultucatEventResponse(event, { origin });
  }

  /**
   * Validates that a CultuCat event exists for trip creation and returns its
   * coordinates. Used by the trips service to enforce the proximity check.
   * A missing event throws 404 `CULTUCAT_EVENT_NOT_FOUND`; any other upstream
   * failure (timeout, network, 5xx, bad gateway) throws a 503.
   */
  async getEventCoordinatesForTrip(
    eventId: number,
  ): Promise<{ lat: number | null; lng: number | null }> {
    let event: CultucatEventPayload;
    try {
      event = await this.client.getEventById(eventId);
    } catch (error) {
      if (error instanceof CultucatClientError && error.kind === 'not_found') {
        throwNotFound(
          'CULTUCAT_EVENT_NOT_FOUND',
          'CultuCat event could not be found or no longer exists.',
        );
      }
      this.logger.warn(
        `CultuCat event validation failed for trip creation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message:
          'CultuCat is unavailable; the trip event reference could not be validated.',
      });
    }

    return {
      lat: toNullableNumber(event.lat),
      lng: toNullableNumber(event.lng),
    };
  }

  private buildSearchRequest(
    query: ListCultucatEventsQueryDto,
  ): CultucatSearchRequest {
    const dateFrom = query.dateFrom.toISOString();
    const dateTo = query.dateTo.toISOString();

    if (query.municipality) {
      return {
        dateFrom,
        dateTo,
        location: {
          mode: 'municipi',
          municipi: query.municipality,
        },
        page: query.page,
      };
    }

    return {
      dateFrom,
      dateTo,
      location: {
        mode: 'coordinates',
        lat: query.lat!,
        lng: query.lng!,
        radiusKm: query.radiusKm!,
      },
      page: query.page,
    };
  }

  private rethrowClientError(error: unknown, fallbackMessage: string): never {
    if (!(error instanceof CultucatClientError)) {
      this.logger.error('Unexpected CultuCat integration failure', error);
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: fallbackMessage,
      });
    }

    if (error.kind === 'bad_request') {
      throw new BadGatewayException({
        code: 'BAD_GATEWAY',
        message: 'CultuCat rejected the request.',
        details: this.extractUpstreamDetails(error.payload),
      });
    }

    if (error.kind === 'unauthorized') {
      throw new InternalServerErrorException(
        'CultuCat integration is not configured correctly.',
      );
    }

    if (error.kind === 'upstream') {
      throw new BadGatewayException({
        code: 'BAD_GATEWAY',
        message: fallbackMessage,
      });
    }

    throw new ServiceUnavailableException({
      code: 'SERVICE_UNAVAILABLE',
      message: fallbackMessage,
    });
  }

  private extractUpstreamDetails(
    payload: unknown,
  ): Record<string, unknown> | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const details = payload as Record<string, unknown>;
    return details.errors ? { errors: details.errors } : undefined;
  }
}
