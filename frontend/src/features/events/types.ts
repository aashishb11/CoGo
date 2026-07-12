export type CultucatTaxonomyItemDto = {
  id: number;
  name: string;
};

export type CultucatExternalEventContextDto = {
  provider: 'cultucat';
  eventId: string;
};

export type CultucatEventDto = {
  eventId: string;
  externalId: string;
  providerNumericId?: number | null;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  schedule?: string | null;
  activityUrl?: string | null;
  ticketsUrl?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  priceInfo?: string | null;
  modality?: string | null;
  imageUrl?: string | null;
  region?: string | null;
  municipality?: string | null;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  distanceFromOriginKm?: number | null;
  scopes: CultucatTaxonomyItemDto[];
  categories: CultucatTaxonomyItemDto[];
  externalEventContext: CultucatExternalEventContextDto;
};

export type CultucatEventListResponse = {
  items: CultucatEventDto[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};
