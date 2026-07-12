import { apiFetch, withParams } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';

export type BoardingTokenResponse = {
  token: string;
  validUntil: string;
};

export type BoardingScanResponse = {
  bookingId: string;
  rideId: string;
  fareCents: number;
  boardedAt: string;
};

const ENDPOINTS = {
  getToken: '/api/me/bookings/:bookingId/boarding-token',
  scan: '/api/boarding-scans',
} as const;

export async function getBoardingToken(bookingId: string): Promise<BoardingTokenResponse> {
  const normalizedBookingId = bookingId.trim();
  if (!normalizedBookingId) {
    throw new ApiError('Booking id is required to fetch a boarding token.');
  }

  const result = await apiFetch<BoardingTokenResponse>({
    path: withParams(ENDPOINTS.getToken, { bookingId: normalizedBookingId }),
    method: 'GET',
  });

  if (!result) {
    throw new ApiError('Failed to load boarding token');
  }

  return result;
}

export async function scanBoarding(token: string): Promise<BoardingScanResponse> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new ApiError('A boarding token is required to record a scan.');
  }

  const result = await apiFetch<BoardingScanResponse>({
    path: ENDPOINTS.scan,
    method: 'POST',
    body: { token: normalizedToken },
  });

  if (!result) {
    throw new ApiError('Failed to record boarding scan');
  }

  return result;
}
