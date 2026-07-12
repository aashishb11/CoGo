import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  type FetchCultucatEventParams,
  type SearchCultucatEventsParams,
  fetchCultucatEvent,
  searchCultucatEvents,
} from '@/features/events/api';

export const eventsQueryKeys = {
  all: () => ['events'] as const,
  search: (params: SearchCultucatEventsParams) => ['events', 'search', params] as const,
  searchInfinite: (params: SearchCultucatEventsParams) =>
    ['events', 'search', 'infinite', params] as const,
  detail: (params: FetchCultucatEventParams) => ['events', 'detail', params] as const,
} as const;

const STALE_TIME_MS = 60_000;

export function useCultucatEventsInfiniteSearch(
  params: SearchCultucatEventsParams | null,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: params
      ? eventsQueryKeys.searchInfinite(params)
      : (['events', 'search', 'infinite', null] as const),
    queryFn: ({ pageParam }) =>
      params ? searchCultucatEvents({ ...params, page: pageParam }) : Promise.resolve(null),
    enabled: enabled && Boolean(params),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage?.hasMore ? lastPage.page + 1 : undefined),
    staleTime: STALE_TIME_MS,
  });
}

export function useCultucatEvent(params: FetchCultucatEventParams | null, enabled = true) {
  return useQuery({
    queryKey: params ? eventsQueryKeys.detail(params) : (['events', 'detail', null] as const),
    queryFn: () => (params ? fetchCultucatEvent(params) : Promise.resolve(null)),
    enabled: enabled && Boolean(params),
    staleTime: STALE_TIME_MS,
  });
}
