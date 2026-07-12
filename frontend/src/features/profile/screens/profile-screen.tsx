import { useRouter } from 'expo-router';
import {
  Building2,
  Car,
  ChevronRight,
  ListChecks,
  LogOut,
  Mail,
  Pencil,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trophy,
  Wallet,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { authClient } from '@/features/auth/auth-client';
import { useRequireAuth } from '@/features/auth/queries';
import { GamificationSummaryCard } from '@/features/gamification';
import { TrustedContactSheet } from '@/features/profile/components/trusted-contact-sheet';
import { useMyProfile, useMySustainability, useTrustedContact } from '@/features/profile/queries';
import { getErrorCode, getErrorStatus, mapErrorToMessageKey } from '@/shared/api';
import { toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { BrandLogo } from '@/shared/ui/components/brand-logo';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

function formatValue(value: unknown, emptyValueText: string) {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return emptyValueText;
}

const LOCALE_LABEL_KEY = {
  es: 'common.locale.es',
  en: 'common.locale.en',
  ca: 'common.locale.ca',
} as const;

function formatLocaleValue(
  value: unknown,
  translate: (key: 'common.locale.es' | 'common.locale.en' | 'common.locale.ca') => string,
  emptyValueText: string,
) {
  const locale = toLang(value);
  if (!locale) {
    return formatValue(value, emptyValueText);
  }
  return translate(LOCALE_LABEL_KEY[locale]);
}

function getInitials(name: string | null, email: string | null, username: unknown) {
  const base =
    (typeof name === 'string' && name.trim()) ||
    (typeof username === 'string' && username.trim()) ||
    (typeof email === 'string' && email.trim()) ||
    '';
  if (!base) {
    return '??';
  }

  const words = base.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return base.slice(0, 2).toUpperCase();
}

export default function ViewProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const session = useRequireAuth();
  const sessionUser = session.data?.user ?? null;
  const profileQuery = useMyProfile();
  const sustainabilityQuery = useMySustainability();
  const trustedContactQuery = useTrustedContact(Boolean(sessionUser));
  const profile = profileQuery.data ?? null;
  const sustainability = sustainabilityQuery.data ?? null;
  const trustedContact = trustedContactQuery.data ?? null;

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [formMessageOverride, setFormMessageOverride] = useState('');
  const [isTrustedContactSheetVisible, setIsTrustedContactSheetVisible] = useState(false);

  const queryError = profileQuery.error ?? null;
  const formMessage = useMemo(() => {
    if (formMessageOverride) {
      return formMessageOverride;
    }
    if (queryError) {
      return t(mapErrorToMessageKey(queryError));
    }
    return '';
  }, [formMessageOverride, queryError, t]);

  const isLoading = session.isPending || (sessionUser !== null && profileQuery.isLoading);

  const performSignOut = useCallback(async () => {
    setFormMessageOverride('');
    setIsSigningOut(true);

    try {
      const result = await authClient.signOut();
      if (result.error) {
        const status = getErrorStatus(result.error);
        const code = getErrorCode(result.error);
        const allowAsSignedOut =
          status === 401 ||
          status === 403 ||
          code === 'NO_SESSION' ||
          code === 'SESSION_NOT_FOUND' ||
          code === 'INVALID_SESSION';
        if (!allowAsSignedOut) {
          throw result.error;
        }
      }
      router.replace('/(auth)/sign-in');
    } catch (error) {
      setFormMessageOverride(t(mapErrorToMessageKey(error)));
      setIsSigningOut(false);
    }
  }, [t, router]);

  const confirmSignOut = useCallback(() => {
    if (Platform.OS === 'web') {
      if (
        window.confirm(
          `${t('viewProfile.logout.confirm.title')}\n\n${t('viewProfile.logout.confirm.message')}`,
        )
      ) {
        void performSignOut();
      }
      return;
    }
    Alert.alert(t('viewProfile.logout.confirm.title'), t('viewProfile.logout.confirm.message'), [
      {
        text: t('viewProfile.logout.confirm.cancel'),
        style: 'cancel',
      },
      {
        text: t('viewProfile.logout.confirm.accept'),
        style: 'destructive',
        onPress: () => {
          void performSignOut();
        },
      },
    ]);
  }, [t, performSignOut]);

  const emptyValueText = t('viewProfile.value.empty');
  const profileUsername = formatValue(profile?.username, emptyValueText);
  const profileName = formatValue(sessionUser?.name, emptyValueText);
  const profileEmail = formatValue(sessionUser?.email, emptyValueText);
  const profileBio = formatValue(profile?.bio, emptyValueText);
  const profilePhone = formatValue(profile?.phone, emptyValueText);
  const profileLocale = formatLocaleValue(profile?.locale, t, emptyValueText);
  const organizationName =
    typeof profile?.organization?.name === 'string' && profile.organization.name.trim().length > 0
      ? profile.organization.name.trim()
      : null;
  const avatarInitials = getInitials(
    sessionUser?.name ?? null,
    sessionUser?.email ?? null,
    profile?.username,
  );
  const isProfileMissing =
    sessionUser !== null && profileQuery.isSuccess && profileQuery.data === null;
  // better-auth's default User type omits `role`; the backend schema has it
  // (see CoGo `user.role` column) and ships it on the session payload.
  const sessionRole = (sessionUser as { role?: string | null } | null)?.role ?? null;
  const isAdmin = sessionRole === 'admin';
  const showAdminAction = Platform.OS === 'web' && isAdmin;

  function handleEditProfile() {
    router.push('../edit-profile');
  }

  function handleOpenAdmin() {
    // typedRoutes regenerates on next `expo start`; remove cast then.
    router.push('/admin' as never);
  }

  function handleOpenLeaderboard() {
    router.push('/leaderboard');
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        rightAction={
          <View style={styles.headerActions}>
            {showAdminAction ? (
              <Pressable
                accessibilityLabel={t('admin.dashboard.button')}
                accessibilityRole="button"
                hitSlop={10}
                onPress={handleOpenAdmin}
                style={({ pressed }) => [styles.adminAction, pressed && styles.adminActionPressed]}
              >
                <Shield color={Palette.primary} size={16} />
                <Text style={styles.adminActionText}>{t('admin.dashboard.button')}</Text>
              </Pressable>
            ) : null}
            <BrandLogo accessibilityLabel={t('header.brand')} size="compact" />
          </View>
        }
        subtitle={t('header.profileSubtitle')}
        title={t('tab.viewProfile.title')}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={() => {
              void profileQuery.refetch();
              void sustainabilityQuery.refetch();
              void trustedContactQuery.refetch();
            }}
            refreshing={
              profileQuery.isRefetching ||
              sustainabilityQuery.isRefetching ||
              trustedContactQuery.isRefetching
            }
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.heroCard}>
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={Palette.primary} size="small" />
                <Text style={styles.loadingText}>{t('viewProfile.loading')}</Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <Pressable
                  accessibilityLabel={t('viewProfile.edit')}
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={handleEditProfile}
                  style={styles.editIconButton}
                >
                  <Pencil color={Palette.textSecondary} size={18} />
                </Pressable>

                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>{avatarInitials}</Text>
                </View>
                <Text numberOfLines={1} style={styles.profileName}>
                  {profileUsername}
                </Text>
                <Text numberOfLines={1} style={styles.profileSubtitle}>
                  {profileName}
                </Text>

                <View style={styles.emailRow}>
                  <Mail color={Palette.textSecondary} size={16} />
                  <Text numberOfLines={1} style={styles.emailText}>
                    {profileEmail}
                  </Text>
                </View>
              </View>

              {organizationName ? (
                <View style={[styles.verificationCard, styles.verificationCardOk]}>
                  <View style={styles.verificationIconCircle}>
                    <Building2 color={Palette.success} size={20} strokeWidth={2.25} />
                  </View>
                  <View style={styles.verificationTextWrap}>
                    <Text style={[styles.verificationTitle, styles.verificationTitleOk]}>
                      {t('viewProfile.verification.memberOf', { organization: organizationName })}
                    </Text>
                    <Text style={styles.verificationDescription}>
                      {t('viewProfile.verification.memberDescription', {
                        organization: organizationName,
                      })}
                    </Text>
                  </View>
                </View>
              ) : null}

              {profile ? (
                <GamificationSummaryCard
                  stats={{
                    ...profile,
                    equivalentTreesPerYear: sustainability?.metrics.equivalentTreesPerYear ?? null,
                    equivalentFuelLitresSaved:
                      sustainability?.metrics.equivalentFuelLitresSaved ?? null,
                  }}
                  title={t('gamification.summary.profileTitle')}
                />
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t('viewProfile.section.profileData')}</Text>
                <View style={styles.card}>
                  <FieldRow label={t('viewProfile.field.username')} value={profileUsername} />
                  <FieldRow label={t('viewProfile.field.name')} value={profileName} />
                  <FieldRow label={t('viewProfile.field.email')} value={profileEmail} />
                  <FieldRow label={t('viewProfile.field.bio')} multiline value={profileBio} />
                  <FieldRow label={t('viewProfile.field.phone')} value={profilePhone} />
                  <FieldRow label={t('viewProfile.field.locale')} last value={profileLocale} />
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t('profile.trustedContact.title')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsTrustedContactSheetVisible(true)}
                  style={({ pressed }) => [
                    styles.trustedContactCard,
                    pressed && styles.linkRowPressed,
                  ]}
                >
                  <View style={styles.trustedContactIcon}>
                    <ShieldCheck color={Palette.primary} size={20} strokeWidth={2.25} />
                  </View>
                  <View style={styles.trustedContactTextWrap}>
                    <Text style={styles.trustedContactTitle}>
                      {trustedContact
                        ? trustedContact.name
                        : t('profile.trustedContact.emptyTitle')}
                    </Text>
                    <Text numberOfLines={2} style={styles.trustedContactSubtitle}>
                      {trustedContact
                        ? trustedContact.email
                        : t('profile.trustedContact.emptySubtitle')}
                    </Text>
                  </View>
                  <ChevronRight color={Palette.textSecondary} size={18} />
                </Pressable>
              </View>

              {isProfileMissing ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/(auth)/create-profile')}
                  style={({ pressed }) => [
                    styles.completePromptCard,
                    pressed && styles.linkRowPressed,
                  ]}
                >
                  <Text style={styles.completePromptTitle}>{t('viewProfile.completeProfile')}</Text>
                  <Text style={styles.completePromptSubtitle}>
                    {t('viewProfile.profileMissing')}
                  </Text>
                </Pressable>
              ) : null}

              <View style={styles.linkRowGroup}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/trips/my-trips',
                      params: { from: 'profile' },
                    })
                  }
                  style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                >
                  <View style={styles.linkRowIcon}>
                    <ListChecks color={Palette.primary} size={20} />
                  </View>
                  <Text style={styles.linkRowText}>{t('viewProfile.myTrips.button')}</Text>
                  <ChevronRight color={Palette.textSecondary} size={18} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/trips/favorites')}
                  style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                >
                  <View style={styles.linkRowIcon}>
                    <Star color={Palette.primary} size={20} />
                  </View>
                  <Text style={styles.linkRowText}>{t('viewProfile.favoriteTrips.button')}</Text>
                  <ChevronRight color={Palette.textSecondary} size={18} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenLeaderboard}
                  style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                >
                  <View style={styles.linkRowIcon}>
                    <Trophy color={Palette.primary} size={20} />
                  </View>
                  <Text style={styles.linkRowText}>{t('gamification.leaderboard.open')}</Text>
                  <ChevronRight color={Palette.textSecondary} size={18} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/cars')}
                  style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                >
                  <View style={styles.linkRowIcon}>
                    <Car color={Palette.primary} size={20} />
                  </View>
                  <Text style={styles.linkRowText}>{t('viewProfile.manageCars.button')}</Text>
                  <ChevronRight color={Palette.textSecondary} size={18} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/wallet')}
                  style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                >
                  <View style={styles.linkRowIcon}>
                    <Wallet color={Palette.primary} size={20} />
                  </View>
                  <Text style={styles.linkRowText}>{t('viewProfile.wallet.button')}</Text>
                  <ChevronRight color={Palette.textSecondary} size={18} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/profile/incidents')}
                  style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                >
                  <View style={styles.linkRowIcon}>
                    <ShieldAlert color={Palette.danger} size={20} />
                  </View>
                  <Text style={styles.linkRowText}>{t('safety.incidents.myIncidentsCta')}</Text>
                  <ChevronRight color={Palette.textSecondary} size={18} />
                </Pressable>
              </View>

              <View style={styles.linkRowGroup}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSigningOut}
                  onPress={confirmSignOut}
                  style={({ pressed }) => [
                    styles.linkRow,
                    styles.linkRowDanger,
                    pressed && styles.linkRowPressed,
                    isSigningOut && styles.linkRowDisabled,
                  ]}
                >
                  <View style={[styles.linkRowIcon, styles.linkRowIconDanger]}>
                    <LogOut color={Palette.danger} size={20} />
                  </View>
                  <Text style={[styles.linkRowText, styles.linkRowTextDanger]}>
                    {isSigningOut
                      ? t('viewProfile.logout.loading')
                      : t('viewProfile.logout.button')}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {formMessage ? <Text style={styles.errorText}>{formMessage}</Text> : null}
        </View>
      </ScrollView>

      <TrustedContactSheet
        contact={trustedContact}
        onClose={() => setIsTrustedContactSheetVisible(false)}
        visible={isTrustedContactSheetVisible}
      />
    </View>
  );
}

type FieldRowProps = {
  label: string;
  value: string;
  multiline?: boolean;
  last?: boolean;
};

function FieldRow({ label, value, multiline, last }: FieldRowProps) {
  return (
    <View style={[styles.fieldRow, last && styles.fieldRowLast]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        numberOfLines={multiline ? 4 : 1}
        style={[styles.fieldValue, multiline && styles.fieldValueMultiline]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 40,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    gap: Spacing.lg,
  },
  heroCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    ...Shadow.cardSoft,
  },
  editIconButton: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    width: '100%',
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: {
    color: Palette.textOnPrimary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize['7xl'],
    letterSpacing: 1,
  },
  profileName: {
    color: Palette.text,
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.bold,
    marginBottom: 2,
  },
  profileSubtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.md,
  },
  verificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.cardSoft,
  },
  verificationCardOk: {
    backgroundColor: Palette.successSurface,
    borderColor: Palette.success,
  },
  verificationCardPending: {
    backgroundColor: Palette.dangerSurface,
    borderColor: Palette.warning,
  },
  verificationIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verificationTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  verificationTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  verificationTitleOk: {
    color: Palette.success,
  },
  verificationTitlePending: {
    color: Palette.warning,
  },
  verificationDescription: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
    width: '100%',
    justifyContent: 'center',
  },
  emailText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.xs,
  },
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    ...Shadow.cardSoft,
  },
  fieldRow: {
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
    gap: 4,
  },
  fieldRowLast: {
    borderBottomWidth: 0,
  },
  fieldLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  fieldValue: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.medium,
  },
  fieldValueMultiline: {
    lineHeight: 21,
  },
  completePromptCard: {
    backgroundColor: Palette.primarySurface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 4,
  },
  completePromptTitle: {
    color: Palette.primaryDark,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  completePromptSubtitle: {
    color: Palette.primaryDark,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    opacity: 0.8,
  },
  trustedContactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.cardSoft,
  },
  trustedContactIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustedContactTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  trustedContactTitle: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  trustedContactSubtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  linkRowGroup: {
    gap: Spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    ...Shadow.cardSoft,
  },
  linkRowDanger: {
    borderColor: Palette.dangerSurface,
  },
  linkRowDisabled: {
    opacity: 0.55,
  },
  linkRowPressed: {
    opacity: 0.85,
  },
  linkRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkRowIconDanger: {
    backgroundColor: Palette.dangerSurface,
  },
  linkRowText: {
    flex: 1,
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
  linkRowTextDanger: {
    color: Palette.danger,
  },
  infoContainer: {
    gap: 10,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  infoText: {
    color: Palette.textSecondary,
    textAlign: 'center',
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: Palette.primary,
    minHeight: 44,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.base,
    textAlign: 'center',
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  adminAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.primary,
    backgroundColor: Palette.primarySurface,
  },
  adminActionPressed: {
    opacity: 0.78,
  },
  adminActionText: {
    color: Palette.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
});
