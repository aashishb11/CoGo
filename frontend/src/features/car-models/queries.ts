import { useQuery } from '@tanstack/react-query';

import { searchCarModels, type SearchCarModelsOptions } from '@/features/car-models/api';

export const MIN_SEARCH_CHARS = 2;
export const DEFAULT_PAGE_SIZE = 20;

export const queryKeys = {
  search: (q: string, opts: SearchCarModelsOptions) =>
    [
      'car-models',
      'search',
      q,
      opts.limit ?? DEFAULT_PAGE_SIZE,
      opts.offset ?? 0,
      opts.latestYearOnly ?? true,
    ] as const,
} as const;

export function useCarModelsSearch(query: string, opts: SearchCarModelsOptions = {}) {
  const trimmed = query.trim();
  const merged: SearchCarModelsOptions = { limit: DEFAULT_PAGE_SIZE, ...opts };
  return useQuery({
    queryKey: queryKeys.search(trimmed, merged),
    queryFn: () => searchCarModels(trimmed, merged),
    enabled: trimmed.length >= MIN_SEARCH_CHARS,
    staleTime: 30_000,
  });
}
