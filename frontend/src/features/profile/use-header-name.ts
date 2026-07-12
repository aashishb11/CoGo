import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth/queries';
import { getMyProfile } from '@/features/profile/api';

/**
 * Resolves the friendly name to greet the user with in the header — falls back
 * across profile.username → session.name (first word) → email local-part.
 * Empty string when there's no signed-in session yet (caller decides what to
 * show).
 */
export function useHeaderName() {
  const session = useSession();
  const user = session.data?.user;
  const userId = user?.id ?? null;

  const profileQuery = useQuery({
    queryKey: ['header-name', 'me', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return '';
      const profile = await getMyProfile();
      const profileName =
        profile && typeof profile.username === 'string' ? profile.username.trim() : '';
      return profileName;
    },
    staleTime: 60_000,
  });

  if (profileQuery.data) return profileQuery.data;
  if (user?.name) return user.name.trim().split(/\s+/)[0] ?? '';
  if (user?.email && user.email.includes('@')) return user.email.split('@')[0] ?? '';
  return '';
}
