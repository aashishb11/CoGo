import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TrafficService {
  private readonly logger = new Logger(TrafficService.name);
  private readonly apiKey: string;
  private readonly fakeDelaySeconds: number | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.getOrThrow<string>('TOMTOM_API_KEY');
    this.fakeDelaySeconds = this.configService.get<number>(
      'TOMTOM_FAKE_DELAY_SECONDS',
    );
  }

  /**
   * Calls TomTom's calculateRoute endpoint and returns the live-vs-baseline
   * delay in seconds. Routes faster than baseline (negative diff) clamp to 0.
   *
   * TomTom's API only authenticates via the `key` query parameter — no
   * Authorization-header form is supported.
   *
   * When `TOMTOM_FAKE_DELAY_SECONDS` is set (dev/demo only), the network
   * call is skipped and that value is returned instead. This lets the
   * watcher → notify pipeline be exercised end-to-end without depending on
   * real-world congestion or burning TomTom quota.
   */
  async getTrafficDelay(
    originLat: number,
    originLng: number,
    destinationLat: number,
    destinationLng: number,
  ): Promise<number> {
    if (this.fakeDelaySeconds !== undefined) {
      this.logger.debug(
        `Returning faked delay ${this.fakeDelaySeconds}s (TOMTOM_FAKE_DELAY_SECONDS set)`,
      );
      return this.fakeDelaySeconds;
    }

    const url =
      `https://api.tomtom.com/routing/1/calculateRoute/` +
      `${originLat},${originLng}:${destinationLat},${destinationLng}/json` +
      `?key=${this.apiKey}&traffic=true&travelMode=car`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `TomTom API responded with HTTP ${response.status}: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      routes?: {
        summary: {
          travelTimeInSeconds: number;
          noTrafficTravelTimeInSeconds: number;
        };
      }[];
    };

    if (!data.routes || data.routes.length === 0) {
      throw new Error('TomTom returned no routes');
    }

    const { travelTimeInSeconds, noTrafficTravelTimeInSeconds } =
      data.routes[0].summary;

    const trafficDelayInSeconds = Math.max(
      0,
      travelTimeInSeconds - noTrafficTravelTimeInSeconds,
    );

    this.logger.debug(
      `Traffic delay (${originLat},${originLng})→(${destinationLat},${destinationLng}): ` +
        `${trafficDelayInSeconds}s`,
    );

    return trafficDelayInSeconds;
  }
}
