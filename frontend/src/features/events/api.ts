import type { CultucatEventDto, CultucatEventListResponse } from '@/features/events/types';
import { apiFetch } from '@/shared/api/client';

const ENDPOINTS = {
  search: '/api/cultucat/events',
  detail: '/api/cultucat/events/:eventId',
} as const;

export type FetchCultucatEventParams = {
  eventId: string;
  originLat?: number;
  originLng?: number;
};

export type SearchCultucatEventsParams = {
  dateFrom: string;
  dateTo: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  municipality?: string;
  page?: number;
};

function buildQuery(entries: [string, string | number | undefined][]): string {
  const qs = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value === undefined || value === '' || value === null) continue;
    qs.set(key, String(value));
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export async function searchCultucatEvents(
  params: SearchCultucatEventsParams,
): Promise<CultucatEventListResponse | null> {
  const query = buildQuery([
    ['dateFrom', params.dateFrom],
    ['dateTo', params.dateTo],
    ['lat', params.lat],
    ['lng', params.lng],
    ['radiusKm', params.radiusKm],
    ['municipality', params.municipality?.trim()],
    ['page', params.page],
  ]);
  return apiFetch<CultucatEventListResponse>({
    path: `${ENDPOINTS.search}${query}`,
    method: 'GET',
  });
}

export async function fetchCultucatEvent(
  params: FetchCultucatEventParams,
): Promise<CultucatEventDto | null> {
  const query = buildQuery([
    ['originLat', params.originLat],
    ['originLng', params.originLng],
  ]);
  return apiFetch<CultucatEventDto>({
    path: `${ENDPOINTS.detail.replace(':eventId', encodeURIComponent(params.eventId))}${query}`,
    method: 'GET',
  });
}
