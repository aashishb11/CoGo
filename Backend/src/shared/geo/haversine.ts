export interface GeoPoint {
  lat: number;
  lng: number;
}

export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);

  const sinHalfDeltaLat = Math.sin(deltaLat / 2);
  const sinHalfDeltaLng = Math.sin(deltaLng / 2);

  const haversine =
    sinHalfDeltaLat * sinHalfDeltaLat +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      sinHalfDeltaLng *
      sinHalfDeltaLng;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}
