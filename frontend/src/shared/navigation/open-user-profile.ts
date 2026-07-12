import { type useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * Routes a user-profile tap to the richer own-profile tab when the target
 * matches the signed-in user, falling back to the public `/users/[id]`
 * screen otherwise. Centralising this avoids duplicating the self-check at
 * every leaderboard row, search result, agenda driver card, etc.
 */
export function openUserProfile(
  router: Router,
  args: {
    targetUserId: string;
    currentUserId: string | null | undefined;
    extraParams?: Record<string, string>;
  },
): void {
  if (args.targetUserId && args.targetUserId === args.currentUserId) {
    router.push('/(tabs)/profile');
    return;
  }
  router.push({
    pathname: '/users/[id]',
    params: { ...(args.extraParams ?? {}), id: args.targetUserId },
  });
}
