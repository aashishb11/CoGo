import { useEffect, useRef } from 'react';

import { useSession } from '@/features/auth/queries';
import { useMyProfile } from '@/features/profile/queries';
import i18n, { toLang } from '@/shared/i18n';

export function ProfileLocaleSync() {
  const session = useSession();
  const userId = session.data?.user?.id ?? null;
  const profileQuery = useMyProfile();
  const syncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      syncedUserIdRef.current = null;
      return;
    }

    if (!profileQuery.isSuccess || syncedUserIdRef.current === userId) {
      return;
    }

    syncedUserIdRef.current = userId;
    const profileLocale = toLang(profileQuery.data?.locale);
    if (profileLocale) {
      void i18n.changeLanguage(profileLocale);
    }
  }, [userId, profileQuery.isSuccess, profileQuery.data?.locale]);

  return null;
}
