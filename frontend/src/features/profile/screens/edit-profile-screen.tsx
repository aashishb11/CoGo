import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { ProfileForm } from '@/features/profile/forms/profile-form';
import { useMyProfile, useUpdateProfile } from '@/features/profile/queries';
import type { CreateProfileInput } from '@/features/profile/schemas';
import { mapErrorToMessageKey } from '@/shared/api';
import i18nInstance, { type Lang, toLang } from '@/shared/i18n';
import { popOrReplace } from '@/shared/navigation/back';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

function toFormText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export default function EditProfileScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;
  const [formError, setFormError] = useState<string | null>(null);

  const session = useRequireAuth();
  const userId = session.data?.user?.id ?? null;
  const profileQuery = useMyProfile();
  const updateProfileMutation = useUpdateProfile(userId);

  const isLoading = session.isPending || profileQuery.isLoading;
  const profile = profileQuery.data ?? null;
  const isProfileMissing = profileQuery.isSuccess && profile === null;
  const queryError = profileQuery.error;

  function handleBack() {
    popOrReplace(router, '/(tabs)/profile');
  }

  async function handleSubmit(data: CreateProfileInput) {
    setFormError(null);
    if (!userId) {
      return;
    }

    try {
      const updatedProfile = await updateProfileMutation.mutateAsync(data);
      const profileLocale = toLang(updatedProfile?.locale ?? data.locale);
      if (profileLocale) {
        void i18nInstance.changeLanguage(profileLocale);
      }
      router.replace('/(tabs)/profile');
    } catch (error) {
      setFormError(t(mapErrorToMessageKey(error)));
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{
          onPress: handleBack,
          accessibilityLabel: t('viewProfile.back'),
        }}
        subtitle={t('editProfile.description')}
        title={t('editProfile.title')}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.card}>
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={Palette.primary} size="small" />
                <Text style={styles.loadingText}>{t('editProfile.loading')}</Text>
              </View>
            </View>
          ) : null}

          {!isLoading && queryError ? (
            <Text style={styles.errorText}>{t(mapErrorToMessageKey(queryError))}</Text>
          ) : null}

          {!isLoading && !queryError && isProfileMissing ? (
            <View style={[styles.card, styles.infoContainer]}>
              <Text style={styles.infoText}>{t('viewProfile.profileMissing')}</Text>
              <Pressable
                onPress={() => router.replace('/(auth)/create-profile')}
                style={styles.cta}
              >
                <Text style={styles.ctaText}>{t('viewProfile.completeProfile')}</Text>
              </Pressable>
            </View>
          ) : null}

          {!isLoading && !queryError && !isProfileMissing ? (
            <View style={styles.card}>
              <ProfileForm
                compactLocaleField
                compactLocaleSwitcher={false}
                defaultValues={{
                  username: toFormText(profile?.username),
                  bio: toFormText(profile?.bio),
                  phone: toFormText(profile?.phone),
                  locale: toLang(profile?.locale) ?? lang,
                }}
                formError={formError}
                loadingLabel={t('editProfile.save.loading')}
                onSubmit={handleSubmit}
                submitLabel={t('editProfile.save.button')}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  content: {
    width: '100%',
    maxWidth: 820,
    gap: Spacing.md,
    paddingTop: Spacing.lg,
  },
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg + 2,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: Spacing.lg,
    ...Shadow.cardSoft,
  },
  loadingContainer: {
    width: '100%',
    minHeight: 100,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  infoContainer: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  infoText: {
    color: Palette.textSecondary,
    textAlign: 'center',
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  cta: {
    backgroundColor: Palette.primary,
    minHeight: 44,
    borderRadius: Radii.sm + 2,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.base,
    textAlign: 'center',
  },
});
