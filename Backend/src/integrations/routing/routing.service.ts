import { Injectable, Logger } from '@nestjs/common';
import { haversineDistanceKm } from '@shared/geo/haversine';

/** Result returned by the OSRM route calculation or Haversine fallback. */
export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  polyline: string | null;
}

/**
 * Vendor-neutral routing service. Today it calls the public OSRM demo server
 * and falls back to the Haversine formula when OSRM is unavailable.
 *
 * Public surface is intentionally minimal — `getRoute` returns a normalised
 * `RouteResult` so consumers (trips, future ride generation) don't depend on
 * any specific routing provider.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  /**
   * Computes driving distance, duration, and an encoded polyline between two
   * coordinates. Falls back to the Haversine great-circle distance when the
   * OSRM request fails for any reason.
   */
  async getRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
  ): Promise<RouteResult> {
    try {
      const url =
        `http://router.project-osrm.org/route/v1/driving/` +
        `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
        `?overview=full&geometries=polyline`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`OSRM returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        code: string;
        routes: { distance: number; duration: number; geometry: string }[];
      };

      if (data.code !== 'Ok' || !data.routes?.length) {
        throw new Error(`OSRM response code: ${data.code}`);
      }

      const route = data.routes[0];
      return {
        distanceKm: route.distance / 1000, // metres → km
        durationMinutes: route.duration / 60, // seconds → minutes
        polyline: route.geometry,
      };
    } catch (error) {
      this.logger.warn(
        'OSRM request failed, falling back to Haversine formula',
        error,
      );

      return {
        distanceKm: haversineDistanceKm(origin, destination),
        durationMinutes: 0,
        polyline: null,
      };
    }
  }
}
