export interface CultucatTaxonomyItem {
  id: number;
  name: string;
}

export interface CultucatEventPayload {
  id?: number | null;
  externalId?: string | null;
  title?: string | null;
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
  comarca?: string | null;
  municipi?: string | null;
  location?: string | null;
  // CultuCat serializes coordinates as decimal strings (e.g. "41.40362990"),
  // not JSON numbers, despite what its OpenAPI spec declares.
  lat?: number | string | null;
  lng?: number | string | null;
  externalCreatedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  ambits?: CultucatTaxonomyItem[] | null;
  categories?: CultucatTaxonomyItem[] | null;
}

export interface CultucatSearchMeta {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CultucatSearchResponse {
  status: string;
  message: string;
  data: CultucatEventPayload[];
  meta: CultucatSearchMeta;
}

export interface CultucatEventDetailResponse {
  status: string;
  message: string;
  data: CultucatEventPayload;
}

export type CultucatSearchRequest =
  | {
      dateFrom: string;
      dateTo: string;
      location: {
        mode: 'coordinates';
        lat: number;
        lng: number;
        radiusKm: number;
      };
      page: number;
    }
  | {
      dateFrom: string;
      dateTo: string;
      location: {
        mode: 'municipi';
        municipi: string;
      };
      page: number;
    };
