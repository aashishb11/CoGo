// pre: both inputs come from authoritative server-side sources
// (trips.totalDistanceKm, carModels.co2KgPerKm). Returns null when
// either is absent so callers can render a clean fallback.
export const computeEstimatedCo2SavingsPerSeatKg = (
  totalDistanceKm: number | null | undefined,
  co2KgPerKm: number | null | undefined,
): number | null => {
  if (totalDistanceKm == null || co2KgPerKm == null) {
    return null;
  }
  return Math.round(totalDistanceKm * co2KgPerKm * 100) / 100;
};
