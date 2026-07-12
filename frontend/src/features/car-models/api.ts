import { apiFetch } from '@/shared/api/client';

export type CarModel = {
  id: string;
  brand: string;
  name: string;
  year: number;
  type: string;
  co2KgPerKm: number;
};

export type SearchCarModelsResult = {
  items: CarModel[];
  total: number;
  limit: number;
  offset: number;
};

export type SearchCarModelsOptions = {
  limit?: number;
  offset?: number;
  // When true, collapse multiple-year rows for the same (brand, name) so the
  // picker doesn't show e.g. "BMW 530i" eight times. Defaults to true for the
  // user-facing autocomplete; admin tools can opt out.
  latestYearOnly?: boolean;
};

export async function searchCarModels(
  query: string,
  opts: SearchCarModelsOptions = {},
): Promise<SearchCarModelsResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { items: [], total: 0, limit: 0, offset: 0 };
  }

  const params = new URLSearchParams({ q: trimmed });
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  // Default to deduped results unless the caller explicitly wants every year.
  params.set('latestYearOnly', String(opts.latestYearOnly ?? true));

  const result = await apiFetch<SearchCarModelsResult>({
    path: `/api/car-models/search?${params.toString()}`,
    method: 'GET',
    allowNotFound: true,
  });
  return result ?? { items: [], total: 0, limit: 0, offset: 0 };
}
