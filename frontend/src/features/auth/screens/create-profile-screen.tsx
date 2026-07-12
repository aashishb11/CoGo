import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';

import AuthCard from '@/features/auth/components/auth-card';
import { AuthScreenLayout } from '@/features/auth/components/auth-screen-layout';
import { useRequireAuth } from '@/features/auth/queries';
import { ProfileForm } from '@/features/profile/forms/profile-form';
import { useCreateProfile } from '@/features/profile/queries';
import type { CreateProfileInput } from '@/features/profile/schemas';
import { getErrorCode, getErrorStatus, mapErrorToMessageKey } from '@/shared/api';
import i18n, { toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';

export default function CreateProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);

  const session = useRequireAuth();
  const userId = session.data?.user?.id ?? null;
  const createProfileMutation = useCreateProfile(userId);

  async function handleContinue(data: CreateProfileInput) {
    setFormError(null);

    if (!userId) {
      router.replace('/(auth)/sign-in');
      return;
    }

    try {
      const profile = await createProfileMutation.mutateAsync({
        username: data.username,
        bio: data.bio,
        phone: data.phone,
        locale: data.locale,
      });
      const profileLocale = toLang(profile?.locale ?? data.locale);
      if (profileLocale) {
        void i18n.changeLanguage(profileLocale);
      }

      router.replace('/(tabs)');
    } catch (error) {
      const status = getErrorStatus(error);
      const code = getErrorCode(error);
      if (status === 409 || code === 'PROFILE_ALREADY_EXISTS') {
        router.replace('/(tabs)');
        return;
      }

      setFormError(t(mapErrorToMessageKey(error)));
    }
  }

  return (
    <AuthScreenLayout hideLanguageSwitcher>
      <Text style={styles.title}>{t('auth.createProfile.title')}</Text>
      <Text style={styles.description}>{t('auth.createProfile.description')}</Text>

      <AuthCard>
        <ProfileForm formError={formError} onSubmit={handleContinue} />

        <Pressable onPress={() => router.replace('/(tabs)')} style={styles.skipContainer}>
          <Text style={styles.skipText}>{t('auth.createProfile.skip')}</Text>
        </Pressable>
      </AuthCard>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.bold,
    color: Palette.text,
    textAlign: 'center',
  },
  description: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 360,
    alignSelf: 'center',
  },
  skipContainer: {
    alignSelf: 'center',
    paddingTop: Spacing.md,
    paddingBottom: 2,
  },
  skipText: {
    color: Palette.primary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
});
