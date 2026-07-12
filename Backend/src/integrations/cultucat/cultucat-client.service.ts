import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CultucatEventDetailResponse,
  CultucatEventPayload,
  CultucatSearchRequest,
  CultucatSearchResponse,
} from '@modules/cultucat/cultucat.types';
import { DEFAULT_CULTUCAT_TIMEOUT_MS } from '@shared/external-events/cultucat.constants';

type CultucatClientErrorKind =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'upstream'
  | 'timeout'
  | 'network';

export class CultucatClientError extends Error {
  constructor(
    readonly kind: CultucatClientErrorKind,
    message: string,
    readonly payload?: unknown,
  ) {
    super(message);
  }
}

@Injectable()
export class CultucatClientService {
  private readonly logger = new Logger(CultucatClientService.name);
  private readonly baseUrl: string;
  private readonly eventsPath: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.getOrThrow<string>('CULTUCAT_API_BASE_URL');
    this.eventsPath = this.config.getOrThrow<string>('CULTUCAT_EVENTS_PATH');
    this.apiKey = this.config.getOrThrow<string>('CULTUCAT_API_KEY');
    this.timeoutMs =
      this.config.get<number>('CULTUCAT_TIMEOUT_MS') ??
      DEFAULT_CULTUCAT_TIMEOUT_MS;
  }

  async searchEvents(
    body: CultucatSearchRequest,
  ): Promise<CultucatSearchResponse> {
    const payload = await this.request(
      this.buildEventsUrl(),
      { method: 'POST', body: JSON.stringify(body) },
      'search',
    );

    if (!this.isSearchResponse(payload)) {
      throw new CultucatClientError(
        'upstream',
        'CultuCat returned a malformed response',
        payload,
      );
    }

    return payload;
  }

  async getEventById(id: number): Promise<CultucatEventPayload> {
    const payload = await this.request(
      `${this.buildEventsUrl()}/${id}`,
      { method: 'GET' },
      'detail',
    );

    if (!this.isDetailResponse(payload)) {
      throw new CultucatClientError(
        'upstream',
        'CultuCat returned a malformed response',
        payload,
      );
    }

    return payload.data;
  }

  private async request(
    url: string,
    init: { method: string; body?: string },
    label: string,
  ): Promise<unknown> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(
      () => abortController.abort(),
      this.timeoutMs,
    );

    try {
      const response = await fetch(url, {
        method: init.method,
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: init.body,
        signal: abortController.signal,
      });

      const payload = await this.readJson(response);
      if (!response.ok) {
        this.logger.warn(
          `CultuCat ${label} failed with HTTP ${response.status}`,
        );
        throw this.toClientError(response.status, payload);
      }

      return payload;
    } catch (error) {
      if (error instanceof CultucatClientError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new CultucatClientError('timeout', 'CultuCat request timed out');
      }

      this.logger.warn(
        `CultuCat request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new CultucatClientError(
        'network',
        'CultuCat request failed',
        error,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private buildEventsUrl(): string {
    const baseUrl = this.baseUrl.replace(/\/+$/, '');
    const path = this.eventsPath.startsWith('/')
      ? this.eventsPath
      : `/${this.eventsPath}`;
    return `${baseUrl}${path}`;
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private toClientError(status: number, payload: unknown): CultucatClientError {
    if (status === 400) {
      return new CultucatClientError(
        'bad_request',
        'CultuCat rejected the request',
        payload,
      );
    }
    if (status === 401) {
      return new CultucatClientError(
        'unauthorized',
        'CultuCat rejected the API key',
        payload,
      );
    }
    if (status === 404) {
      return new CultucatClientError(
        'not_found',
        'CultuCat event does not exist',
        payload,
      );
    }
    return new CultucatClientError(
      'upstream',
      `CultuCat responded with HTTP ${status}`,
      payload,
    );
  }

  private isSearchResponse(
    payload: unknown,
  ): payload is CultucatSearchResponse {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const candidate = payload as Partial<CultucatSearchResponse>;
    return (
      Array.isArray(candidate.data) &&
      candidate.meta !== undefined &&
      typeof candidate.meta === 'object'
    );
  }

  private isDetailResponse(
    payload: unknown,
  ): payload is CultucatEventDetailResponse {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const candidate = payload as Partial<CultucatEventDetailResponse>;
    return (
      candidate.data !== undefined &&
      candidate.data !== null &&
      typeof candidate.data === 'object'
    );
  }
}
