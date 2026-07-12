import type {
  AdminFlaggedRideListResponseDto,
  AdminIncidentDetailDto,
  AdminIncidentListResponseDto,
  AdminRideReviewDto,
  AdminRideReviewRideDto,
} from '@/features/incidents/types';
import { apiFetch, withParams } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';

// Admin-only safety endpoints. The reporter-facing flow (POST
// `/api/rides/:rideId/incidents`, GET `/api/me/incidents`) lives in
// `features/safety/` to keep the user UI and admin dashboard decoupled.
const ENDPOINTS = {
  adminList: '/api/admin/incidents',
  adminDetail: '/api/admin/incidents/:id',
  adminFlaggedRides: '/api/admin/rides/flagged',
  adminRideReview: '/api/admin/rides/:rideId/review',
} as const;

export async function listAdminIncidents(
  page: number,
  limit: number,
): Promise<AdminIncidentListResponseDto> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  const result = await apiFetch<AdminIncidentListResponseDto>({
    path: `${ENDPOINTS.adminList}?${params.toString()}`,
    method: 'GET',
  });
  if (!result) {
    return { items: [], page, limit, total: 0 };
  }
  return result;
}

export async function getAdminIncidentById(id: string): Promise<AdminIncidentDetailDto | null> {
  const normalizedId = id.trim();
  if (!normalizedId) return null;
  return apiFetch<AdminIncidentDetailDto>({
    path: withParams(ENDPOINTS.adminDetail, { id: normalizedId }),
    method: 'GET',
    allowNotFound: true,
  });
}

export async function listFlaggedRides(
  page: number,
  limit: number,
): Promise<AdminFlaggedRideListResponseDto> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  const result = await apiFetch<AdminFlaggedRideListResponseDto>({
    path: `${ENDPOINTS.adminFlaggedRides}?${params.toString()}`,
    method: 'GET',
  });
  if (!result) {
    return { items: [], page, limit, total: 0 };
  }
  return result;
}

export async function getRideReview(rideId: string): Promise<AdminRideReviewDto | null> {
  const normalizedRideId = rideId.trim();
  if (!normalizedRideId) return null;
  return apiFetch<AdminRideReviewDto>({
    path: withParams(ENDPOINTS.adminRideReview, { rideId: normalizedRideId }),
    method: 'GET',
    allowNotFound: true,
  });
}

export async function resolveRideReview(rideId: string): Promise<AdminRideReviewRideDto> {
  const normalizedRideId = rideId.trim();
  if (!normalizedRideId) {
    throw new ApiError('Ride id is required to resolve a review.', {
      code: 'VALIDATION',
    });
  }
  const result = await apiFetch<AdminRideReviewRideDto>({
    path: withParams(ENDPOINTS.adminRideReview, { rideId: normalizedRideId }),
    method: 'PATCH',
  });
  if (!result) {
    throw new ApiError('Ride review response missing', { code: 'RIDE_REVIEW_PAYLOAD_MISSING' });
  }
  return result;
}
