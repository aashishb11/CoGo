import { decodePolyline } from './polyline';

describe('decodePolyline', () => {
  it('returns an empty array for null or empty input', () => {
    expect(decodePolyline(null)).toEqual([]);
    expect(decodePolyline('')).toEqual([]);
  });

  it('decodes the Google reference example to [lat, lng] tuples', () => {
    // From https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const result = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');

    expect(result).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });
});
