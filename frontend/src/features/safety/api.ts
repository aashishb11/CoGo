import {
  CreateIncidentSchema,
  type CreateIncidentInput,
  type CreateIncidentPayload,
  type IncidentCategory,
} from '@/features/safety/schemas';
import { apiFetch, validateSchema, withParams } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';

export type IncidentResponse = {
  id: string;
  rideId: string;
  category: IncidentCategory;
  note?: string | null;
  createdAt: string;
};

type IncidentListResponse = {
  items?: IncidentResponse[];
  page?: number;
  limit?: number;
  total?: number;
};

const ENDPOINTS = {
  createForRide: '/api/rides/:rideId/incidents',
  mine: '/api/me/incidents',
} as const;

function buildBody(input: CreateIncidentPayload) {
  return {
    category: input.category,
    ...(input.note ? { note: input.note } : {}),
  };
}

export async function createRideIncident(
  rideId: string,
  input: CreateIncidentInput,
): Promise<IncidentResponse> {
  const normalizedRideId = rideId.trim();
  if (!normalizedRideId) {
    throw new ApiError('Ride id is required to report an incident.');
  }
  const parsed = validateSchema(CreateIncidentSchema, input, 'Invalid incident input');
  const result = await apiFetch<IncidentResponse>({
    path: withParams(ENDPOINTS.createForRide, { rideId: normalizedRideId }),
    method: 'POST',
    body: buildBody(parsed),
  });
  if (!result) {
    throw new ApiError('Failed to report incident');
  }
  return result;
}

export async function listMyIncidents(): Promise<IncidentResponse[]> {
  const params = new URLSearchParams({ limit: '50' });
  const result = await apiFetch<IncidentListResponse>({
    path: `${ENDPOINTS.mine}?${params.toString()}`,
    method: 'GET',
  });
  return Array.isArray(result?.items) ? result.items : [];
}
