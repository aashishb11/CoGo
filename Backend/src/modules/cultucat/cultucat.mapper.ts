import { CULTUCAT_IMAGE_BASE_URL } from '@shared/external-events/cultucat.constants';
import { CULTUCAT_PROVIDER } from '@shared/external-events/external-event.types';
import { haversineDistanceKm } from '@shared/geo/haversine';
import type { CultucatEventResponseDto } from './dto/cultucat-events-response.dto';
import type {
  CultucatEventPayload,
  CultucatTaxonomyItem,
} from './cultucat.types';

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const toDateOrNull = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// CultuCat sends lat/lng as decimal strings, so coerce strings as well.
export const toNullableNumber = (
  value: number | string | null | undefined,
): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toTaxonomyItems = (
  items: CultucatTaxonomyItem[] | null | undefined,
): CultucatTaxonomyItem[] => items ?? [];

// CultuCat sends `imageUrl` as a relative asset path; resolve it to an
// absolute URL, leaving any already-absolute URL untouched.
const toAbsoluteImageUrl = (
  value: string | null | undefined,
): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${CULTUCAT_IMAGE_BASE_URL}${path}`;
};

export const toCultucatEventId = (event: CultucatEventPayload): string => {
  if (typeof event.id === 'number') {
    return String(event.id);
  }
  return 'unknown-event';
};

export const toCultucatEventResponse = (
  event: CultucatEventPayload,
  options?: { origin?: { lat: number; lng: number } },
): CultucatEventResponseDto => {
  const eventId = toCultucatEventId(event);
  const lat = toNullableNumber(event.lat);
  const lng = toNullableNumber(event.lng);

  const distanceFromOriginKm =
    options?.origin && lat !== null && lng !== null
      ? round2(haversineDistanceKm(options.origin, { lat, lng }))
      : null;

  return {
    eventId,
    externalId: event.externalId?.trim() || eventId,
    providerNumericId: typeof event.id === 'number' ? event.id : null,
    title: event.title?.trim() || eventId,
    subtitle: event.subtitle ?? null,
    description: event.description ?? null,
    startDate: toDateOrNull(event.startDate),
    endDate: toDateOrNull(event.endDate),
    schedule: event.schedule ?? null,
    activityUrl: event.activityUrl ?? null,
    ticketsUrl: event.ticketsUrl ?? null,
    minPrice: event.minPrice ?? null,
    maxPrice: event.maxPrice ?? null,
    priceInfo: event.priceInfo ?? null,
    modality: event.modality ?? null,
    imageUrl: toAbsoluteImageUrl(event.imageUrl),
    region: event.comarca ?? null,
    municipality: event.municipi ?? null,
    location: event.location ?? null,
    lat,
    lng,
    distanceFromOriginKm,
    scopes: toTaxonomyItems(event.ambits),
    categories: toTaxonomyItems(event.categories),
    externalEventContext: {
      provider: CULTUCAT_PROVIDER,
      eventId,
    },
  };
};
