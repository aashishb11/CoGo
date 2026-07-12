// Google encoded polyline decoder (precision 5 — the format produced by
// RoutingService and stored in trips.route_polyline). Inline here to avoid
// pulling in a dependency for ~30 lines of algorithm.
// Reference: https://developers.google.com/maps/documentation/utilities/polylinealgorithm

const PRECISION = 1e5;

export const decodePolyline = (encoded: string | null): [number, number][] => {
  if (!encoded) return [];

  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lat / PRECISION, lng / PRECISION]);
  }

  return coordinates;
};
