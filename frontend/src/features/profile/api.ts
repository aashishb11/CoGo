import type { GamificationBadge } from '@/features/gamification/types';
import { CreateProfileSchema, TrustedContactSchema } from '@/features/profile/schemas';
import type { TrustedContactInput } from '@/features/profile/schemas';
import { apiFetch, validateSchema } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';
import type { Lang } from '@/shared/i18n';

export type UserProfile = {
  id?: string;
  userId?: string;
  username?: string;
  bio?: string | null;
  phone?: string | null;
  locale?: string | null;
  organization?: { id: string; name: string } | null;
  totalCo2Saved?: number | null;
  xpPoints?: number | null;
  level?: number | null;
  xpToNextLevel?: number | null;
  ridesAsDriver?: number | null;
  ridesAsPassenger?: number | null;
  badges?: GamificationBadge[] | null;
  [key: string]: unknown;
};

export type SustainabilitySummary = {
  userId: string;
  totalXp: number;
  xpToNextLevel: number;
  level: number;
  metrics: {
    totalCo2SavedKg: number;
    equivalentTreesPerYear: number;
    equivalentFuelLitresSaved: number;
  };
};

export type CreateUserProfileInput = {
  username: string;
  bio?: string;
  phone?: string;
  locale?: Lang;
};

export type UpdateUserProfileInput = CreateUserProfileInput;

export type TrustedContact = {
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

// Backward-compat alias so existing `instanceof ProfileApiError` checks keep working.
export { ApiError as ProfileApiError };

function buildProfilePayload(input: CreateUserProfileInput): CreateUserProfileInput {
  const parsed = validateSchema(CreateProfileSchema, input, 'Invalid profile input');

  const payload: CreateUserProfileInput = { username: parsed.username };
  if (parsed.bio !== undefined) {
    payload.bio = parsed.bio;
  }
  if (parsed.phone !== undefined) {
    payload.phone = parsed.phone;
  }
  if (parsed.locale !== undefined) {
    payload.locale = parsed.locale;
  }

  return payload;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  return apiFetch<UserProfile>({
    path: `/api/users/${encodeURIComponent(userId)}/profile`,
    method: 'GET',
    allowNotFound: true,
  });
}

export async function getMyProfile(): Promise<UserProfile | null> {
  return apiFetch<UserProfile>({
    path: `/api/me/profile`,
    method: 'GET',
    allowNotFound: true,
  });
}

export async function getMySustainability(): Promise<SustainabilitySummary | null> {
  return apiFetch<SustainabilitySummary>({
    path: `/api/me/sustainability`,
    method: 'GET',
    allowNotFound: true,
  });
}

export async function createUserProfile(
  input: CreateUserProfileInput,
): Promise<UserProfile | null> {
  const payload = buildProfilePayload(input);

  return apiFetch<UserProfile>({
    path: `/api/me/profile`,
    method: 'POST',
    body: payload,
  });
}

export async function updateUserProfile(
  input: UpdateUserProfileInput,
): Promise<UserProfile | null> {
  const payload = buildProfilePayload(input);

  return apiFetch<UserProfile>({
    path: `/api/me/profile`,
    method: 'PATCH',
    body: payload,
  });
}

export async function getTrustedContact(): Promise<TrustedContact | null> {
  return apiFetch<TrustedContact>({
    path: '/api/me/trusted-contact',
    method: 'GET',
    allowNotFound: true,
  });
}

export async function upsertTrustedContact(
  input: TrustedContactInput,
): Promise<TrustedContact | null> {
  const payload = validateSchema(TrustedContactSchema, input, 'Invalid trusted contact input');

  return apiFetch<TrustedContact>({
    path: '/api/me/trusted-contact',
    method: 'PUT',
    body: payload,
  });
}

export type AgendaFeedResponse = { url: string };

export async function getAgendaFeed(): Promise<AgendaFeedResponse | null> {
  return apiFetch<AgendaFeedResponse>({ path: '/api/me/agenda/feed', method: 'GET' });
}

export async function rotateAgendaFeed(): Promise<AgendaFeedResponse | null> {
  return apiFetch<AgendaFeedResponse>({ path: '/api/me/agenda/feed/rotate', method: 'POST' });
}
