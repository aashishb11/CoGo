import { useLocalSearchParams, useRouter } from 'expo-router';
import { BadgeCheck, Building2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GamificationSummaryCard } from '@/features/gamification';
import { useProfile } from '@/features/profile/queries';
import { backToSearchOrFallback } from '@/features/trips/find-trips/return-to-search';
import { mapErrorToMessageKey } from '@/shared/api';
import { popOrReplace } from '@/shared/navigation/back';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

function readId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function copyParams(params: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      Array.isArray(value) ? (value[0] ?? '') : (value ?? ''),
    ]),
  );
}

function getInitials(name: string | undefined | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

function formatJoinedDate(value: unknown, locale: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(date);
}

export default function UserProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const userId = readId(params.id);

  const profileQuery = useProfile(userId || null);
  const profile = profileQuery.data ?? null;

  const isLoading = profileQuery.isPending && Boolean(userId);
  const errorMessage = profileQuery.error ? t(mapErrorToMessageKey(profileQuery.error)) : '';

  const username =
    typeof profile?.username === 'string' && profile.username.trim().length > 0
      ? profile.username.trim()
      : null;
  const bio =
    typeof profile?.bio === 'string' && profile.bio.trim().length > 0 ? profile.bio.trim() : null;
  const joined = formatJoinedDate(profile?.createdAt, i18n.language);
  const isVerified = profile?.emailVerified === true;
  const organizationName =
    typeof profile?.organization?.name === 'string' && profile.organization.name.trim().length > 0
      ? profile.organization.name.trim()
      : null;

  function handleBack() {
    const from = readId(params.from);

    // `from === 'search'` reconstructs the search filter state from `back*`
    // params, and the trip-details branch jumps to a *different* trip-details
    // with merged params — both genuinely need replace. Everything else uses
    // the standard pop-or-replace so the back animation and scroll position
    // are preserved.
    if (from === 'search') {
      backToSearchOrFallback(router, params);
      return;
    }

    if (from === 'trip-details') {
      const backTripId = readId(params.backTripId);
      if (backTripId) {
        const nextParams = copyParams(params);
        const originalTripDetailsFrom = readId(params.backTripDetailsFrom);
        nextParams.id = backTripId;
        nextParams.rideId = readId(params.backRideId);
        if (originalTripDetailsFrom) {
          nextParams.from = originalTripDetailsFrom;
        }
        popOrReplace(router, {
          pathname: '/trips/[id]',
          params: { ...nextParams, id: backTripId },
        });
        return;
      }
    }

    popOrReplace(router, '/(tabs)/profile');
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{
          onPress: handleBack,
          accessibilityLabel: t('userProfile.back'),
        }}
        title={t('userProfile.title')}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={() => {
              void profileQuery.refetch();
            }}
            refreshing={profileQuery.isRefetching}
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.inlineStatus}>
            <ActivityIndicator color={Palette.primary} size="small" />
            <Text style={styles.statusText}>{t('userProfile.loading')}</Text>
          </View>
        ) : null}

        {!isLoading && errorMessage ? (
          <View style={[styles.inlineStatus, styles.errorStatus]}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {!isLoading && !errorMessage && !profile ? (
          <View style={styles.inlineStatus}>
            <Text style={styles.statusText}>{t('userProfile.notFound')}</Text>
          </View>
        ) : null}

        {!isLoading && profile ? (
          <>
            {/* Identity block: avatar, name, verification, joined date, bio */}
            <View style={styles.identityCard}>
              <View style={styles.identityRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(username)}</Text>
                </View>

                <View style={styles.identityText}>
                  <Text numberOfLines={1} style={styles.username}>
                    {username ?? t('userProfile.unnamed')}
                  </Text>

                  {isVerified || organizationName ? (
                    <View style={styles.verifiedBadge}>
                      {isVerified ? (
                        <BadgeCheck color={Palette.primaryDark} size={14} />
                      ) : (
                        <Building2 color={Palette.primaryDark} size={14} />
                      )}
                      <Text style={styles.verifiedBadgeText}>
                        {isVerified
                          ? organizationName
                            ? t('userProfile.verifiedBy', { organization: organizationName })
                            : t('userProfile.verified')
                          : t('userProfile.organization', {
                              organization: organizationName ?? '',
                            })}
                      </Text>
                    </View>
                  ) : null}

                  {joined ? (
                    <Text style={styles.joined}>{t('userProfile.joined', { date: joined })}</Text>
                  ) : null}
                </View>
              </View>

              {bio ? <Text style={styles.bio}>{bio}</Text> : null}
            </View>

            {/* Stats section */}
            <GamificationSummaryCard
              showXp={false}
              stats={profile}
              title={t('gamification.summary.publicProfileTitle')}
            />
          </>
        ) : null}
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
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl + Spacing.md,
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.xxl,
  },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
  },
  errorStatus: {
    backgroundColor: Palette.dangerSurface,
  },
  statusText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  identityCard: {
    borderRadius: Radii.lg,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    gap: Spacing.lg,
    ...Shadow.cardSoft,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.sm,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Palette.primaryDark,
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
  },
  username: {
    color: Palette.text,
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.extrabold,
    lineHeight: FontSize['3xl'] * 1.2,
  },
  verifiedBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
    backgroundColor: Palette.primarySurface,
  },
  verifiedBadgeText: {
    color: Palette.primaryDark,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  joined: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  bio: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    lineHeight: 22,
  },
});
