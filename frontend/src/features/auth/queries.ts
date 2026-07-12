import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { authClient } from '@/features/auth/auth-client';

// Re-exported so callers can `useSession` from one place. Better-auth's hook
// reads from a nanostores atom that updates synchronously on sign-in/sign-out,
// so no React Query cache or manual seeding is needed.
export const useSession = authClient.useSession;

// Redirect-guard: bounces to the auth stack if the session resolves to no user.
// Waits for the initial fetch to settle (`isPending` flips false) before
// reading `data` — otherwise we'd misfire on first render.
export function useRequireAuth() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session.isPending) return;
    if (!session.data?.user?.id) {
      router.replace('/(auth)/sign-in');
    }
  }, [session.isPending, session.data?.user?.id, router]);

  return session;
}
