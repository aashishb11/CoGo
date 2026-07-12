import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/queries';
import {
  createUserProfile,
  getAgendaFeed,
  getMyProfile,
  getMySustainability,
  getTrustedContact,
  getUserProfile,
  rotateAgendaFeed,
  type AgendaFeedResponse,
  type CreateUserProfileInput,
  type SustainabilitySummary,
  type TrustedContact,
  updateUserProfile,
  type UpdateUserProfileInput,
  upsertTrustedContact,
} from '@/features/profile/api';
import type { TrustedContactInput } from '@/features/profile/schemas';
import { invalidateAll } from '@/shared/query/invalidation';

export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  myProfile: () => ['my-profile'] as const,
  mySustainability: () => ['my-sustainability'] as const,
  tabsHeaderUsername: () => ['tabs-header-username'] as const,
  agendaFeed: () => ['agenda-feed'] as const,
  trustedContact: () => ['trusted-contact'] as const,
} as const;

export function useProfile(userId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.profile(userId ?? ''),
    queryFn: () => getUserProfile(userId as string),
    enabled: Boolean(userId),
  });
}

export function useMyProfile() {
  const session = useSession();
  const userId = session.data?.user?.id ?? null;
  return useQuery({
    queryKey: queryKeys.myProfile(),
    queryFn: () => getMyProfile(),
    enabled: Boolean(userId),
  });
}

export function useMySustainability() {
  const session = useSession();
  const userId = session.data?.user?.id ?? null;
  return useQuery<SustainabilitySummary | null>({
    queryKey: queryKeys.mySustainability(),
    queryFn: () => getMySustainability(),
    enabled: Boolean(userId),
  });
}

function invalidateProfile(
  qc: ReturnType<typeof useQueryClient>,
  userId: string | null | undefined,
) {
  if (!userId) return;
  invalidateAll(qc, [
    queryKeys.profile(userId),
    queryKeys.myProfile(),
    queryKeys.mySustainability(),
    queryKeys.tabsHeaderUsername(),
  ]);
}

export function useCreateProfile(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserProfileInput) => createUserProfile(input),
    onSuccess: () => invalidateProfile(qc, userId),
  });
}

export function useUpdateProfile(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserProfileInput) => updateUserProfile(input),
    onSuccess: () => invalidateProfile(qc, userId),
  });
}

export function useTrustedContact(enabled = true) {
  const session = useSession();
  const userId = session.data?.user?.id ?? null;
  return useQuery({
    queryKey: queryKeys.trustedContact(),
    queryFn: getTrustedContact,
    enabled: enabled && Boolean(userId),
  });
}

export function useUpsertTrustedContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TrustedContactInput) => upsertTrustedContact(input),
    onSuccess: (data: TrustedContact | null) => {
      qc.setQueryData(queryKeys.trustedContact(), data);
      invalidateAll(qc, [queryKeys.trustedContact()]);
    },
  });
}

export function useAgendaFeed() {
  return useQuery({
    queryKey: queryKeys.agendaFeed(),
    queryFn: getAgendaFeed,
    enabled: false,
  });
}

export function useRotateAgendaFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rotateAgendaFeed,
    onSuccess: (data: AgendaFeedResponse | null) => {
      if (data) qc.setQueryData(queryKeys.agendaFeed(), data);
    },
  });
}
