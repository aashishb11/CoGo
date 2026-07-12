import { useRouter } from 'expo-router';
import { Car, Crown, Leaf, Trophy } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { useLeaderboard } from '@/features/gamification/queries';
import type {
  LeaderboardEntry,
  LeaderboardScope,
  LeaderboardSort,
} from '@/features/gamification/types';
import { useMyProfile } from '@/features/profile/queries';
import { mapErrorToMessageKey } from '@/shared/api';
import { popOrReplace } from '@/shared/navigation/back';
import { openUserProfile } from '@/shared/navigation/open-user-profile';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { SegmentedControl } from '@/shared/ui/components/segmented-control';
import { Toast, type ToastKind } from '@/shared/ui/components/toast';

type ToastState = { kind: ToastKind; message: string } | null;

function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  return fractionDigits === 0 ? String(Math.round(value)) : value.toFixed(fractionDigits);
}

function getPodiumTone(rank: number) {
  if (rank === 1) {
    return {
      row: styles.rowGold,
      rank: styles.rankGold,
      rankText: styles.rankTextStrong,
      iconColor: Palette.rankGold,
    };
  }
  if (rank === 2) {
    return {
      row: styles.rowSilver,
      rank: styles.rankSilver,
      rankText: styles.rankTextStrong,
      iconColor: Palette.rankSilver,
    };
  }
  if (rank === 3) {
    return {
      row: styles.rowBronze,
      rank: styles.rankBronze,
      rankText: styles.rankTextStrong,
      iconColor: Palette.rankBronze,
    };
  }
  return null;
}

function buildCurrentUserEntry({
  currentUserId,
  fallbackRank,
  organization,
  profile,
  sessionName,
}: {
  currentUserId: string | null;
  fallbackRank: number;
  organization: { id: string; name: string } | null;
  profile: {
    username?: unknown;
    xpPoints?: unknown;
    level?: unknown;
    totalCo2Saved?: unknown;
    ridesAsDriver?: unknown;
    ridesAsPassenger?: unknown;
  } | null;
  sessionName?: string | null;
}): LeaderboardEntry | null {
  if (!currentUserId) return null;
  return {
    rank: fallbackRank,
    userId: currentUserId,
    username:
      typeof profile?.username === 'string' && profile.username.trim().length > 0
        ? profile.username.trim()
        : sessionName?.trim() || 'You',
    xpPoints: typeof profile?.xpPoints === 'number' ? profile.xpPoints : 0,
    level: typeof profile?.level === 'number' ? profile.level : 0,
    totalCo2Saved: typeof profile?.totalCo2Saved === 'number' ? profile.totalCo2Saved : 0,
    ridesCompleted:
      (typeof profile?.ridesAsDriver === 'number' ? profile.ridesAsDriver : 0) +
      (typeof profile?.ridesAsPassenger === 'number' ? profile.ridesAsPassenger : 0),
    organization,
  };
}

export default function LeaderboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const session = useRequireAuth();
  const isAuthenticated = Boolean(session.data?.user?.id);
  const myProfileQuery = useMyProfile();
  const organization = myProfileQuery.data?.organization ?? null;
  const hasCommunity = Boolean(organization?.id);

  const [sortBy, setSortBy] = useState<LeaderboardSort>('xp_points');
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [toast, setToast] = useState<ToastState>(null);
  const effectiveScope: LeaderboardScope = hasCommunity ? scope : 'global';
  const organizationId = effectiveScope === 'community' ? organization?.id : null;

  const leaderboardQuery = useLeaderboard(
    { sortBy, organizationId, page: 1, limit: 50 },
    isAuthenticated && (!hasCommunity || !myProfileQuery.isLoading),
  );

  const sortOptions = useMemo(
    () => [
      { value: 'xp_points' as const, label: t('gamification.leaderboard.sort.xp') },
      { value: 'co2_saved' as const, label: t('gamification.leaderboard.sort.co2') },
      { value: 'rides_completed' as const, label: t('gamification.leaderboard.sort.rides') },
    ],
    [t],
  );
  const scopeOptions = useMemo(
    () => [
      { value: 'global' as const, label: t('gamification.leaderboard.scope.global') },
      {
        value: 'community' as const,
        label: t('gamification.leaderboard.scope.community'),
        disabled: !hasCommunity,
      },
    ],
    [hasCommunity, t],
  );

  const errorMessage = leaderboardQuery.error
    ? t(mapErrorToMessageKey(leaderboardQuery.error))
    : '';
  const isLoading = leaderboardQuery.isLoading || myProfileQuery.isLoading;
  const entries = useMemo(() => leaderboardQuery.data?.items ?? [], [leaderboardQuery.data?.items]);
  const currentUserId = session.data?.user?.id ?? null;
  const [visibleUserIds, setVisibleUserIds] = useState<Set<string>>(() => new Set());
  const [hasMeasuredVisibleRows, setHasMeasuredVisibleRows] = useState(false);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<LeaderboardEntry>[] }) => {
      setHasMeasuredVisibleRows(true);
      setVisibleUserIds(
        new Set(
          viewableItems
            .map((item) => item.item?.userId)
            .filter((userId): userId is string => typeof userId === 'string'),
        ),
      );
    },
  ).current;
  const currentUserEntryFromBackend = currentUserId
    ? entries.find((entry) => entry.userId === currentUserId)
    : undefined;
  const currentUserEntry =
    currentUserEntryFromBackend ??
    buildCurrentUserEntry({
      currentUserId,
      fallbackRank: (leaderboardQuery.data?.total ?? entries.length) + 1,
      organization,
      profile: myProfileQuery.data ?? null,
      sessionName: session.data?.user?.name,
    });
  const displayEntries = useMemo(() => {
    const withCurrentUser =
      currentUserEntry && !entries.some((entry) => entry.userId === currentUserEntry.userId)
        ? [...entries, currentUserEntry]
        : entries;
    return withCurrentUser;
  }, [currentUserEntry, entries]);
  const isCurrentUserVisible =
    currentUserId !== null && hasMeasuredVisibleRows && visibleUserIds.has(currentUserId);
  const showStickyCurrentUser =
    Boolean(currentUserEntry) &&
    currentUserId !== null &&
    hasMeasuredVisibleRows &&
    !isCurrentUserVisible &&
    !isLoading &&
    !errorMessage &&
    displayEntries.length > 0;
  const headerSubtitle =
    organization && effectiveScope === 'community'
      ? t('gamification.leaderboard.communityTitle', { organization: organization.name })
      : t('gamification.leaderboard.globalTitle');

  function handleBack() {
    popOrReplace(router, '/(tabs)/profile');
  }

  const dismissToast = useCallback(() => setToast(null), []);

  function handleDisabledScopePress(nextScope: LeaderboardScope) {
    if (nextScope !== 'community') return;
    setToast({ kind: 'error', message: t('gamification.leaderboard.noCommunity') });
  }

  function handleOpenUserProfile(userId: string) {
    openUserProfile(router, {
      targetUserId: userId,
      currentUserId,
      extraParams: { from: 'leaderboard' },
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{
          onPress: handleBack,
          accessibilityLabel: t('gamification.leaderboard.back'),
        }}
        bottom={
          <SegmentedControl
            onChange={setScope}
            onDisabledPress={handleDisabledScopePress}
            options={scopeOptions}
            value={effectiveScope}
            variant="underline"
          />
        }
        subtitle={headerSubtitle}
        title={t('gamification.leaderboard.title')}
      />

      <FlatList
        contentContainerStyle={[
          styles.content,
          showStickyCurrentUser && styles.contentWithStickyUser,
        ]}
        data={!isLoading && !errorMessage ? displayEntries : []}
        keyExtractor={(entry) => entry.userId}
        ListEmptyComponent={
          !isLoading && !errorMessage ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusText}>{t('gamification.leaderboard.empty')}</Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <>
            <View style={styles.controls}>
              <SegmentedControl onChange={setSortBy} options={sortOptions} value={sortBy} />
            </View>

            {organization && effectiveScope === 'community' ? (
              <View style={styles.communityNote}>
                <Text style={styles.communityLabel}>
                  {t('gamification.leaderboard.scope.community')}
                </Text>
                <Text numberOfLines={1} style={styles.communityName}>
                  {organization.name}
                </Text>
              </View>
            ) : null}

            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={Palette.primary} size="small" />
                <Text style={styles.statusText}>{t('gamification.leaderboard.loading')}</Text>
              </View>
            ) : null}

            {!isLoading && errorMessage ? (
              <View style={[styles.statusCard, styles.errorCard]}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </>
        }
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item }) => (
          <LeaderboardRow
            entry={item}
            isCurrentUser={item.userId === currentUserId}
            onPress={handleOpenUserProfile}
          />
        )}
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={() => {
              void Promise.all([leaderboardQuery.refetch(), myProfileQuery.refetch()]);
            }}
            refreshing={leaderboardQuery.isRefetching || myProfileQuery.isRefetching}
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
      />

      {showStickyCurrentUser && currentUserEntry ? (
        <View pointerEvents="box-none" style={styles.stickyCurrentUserWrap}>
          <LeaderboardRow
            compact
            entry={currentUserEntry}
            isCurrentUser
            onPress={handleOpenUserProfile}
          />
        </View>
      ) : null}

      <Toast
        kind={toast?.kind ?? 'error'}
        message={toast?.message ?? ''}
        onDismiss={dismissToast}
        visible={toast !== null}
      />
    </View>
  );
}

function LeaderboardRow({
  entry,
  compact = false,
  isCurrentUser,
  onPress,
}: {
  entry: LeaderboardEntry;
  compact?: boolean;
  isCurrentUser: boolean;
  onPress: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const podiumTone = getPodiumTone(entry.rank);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(entry.userId)}
      style={({ pressed }) => [
        styles.row,
        compact && styles.rowCompact,
        podiumTone?.row,
        isCurrentUser && styles.rowCurrentUser,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.rank, podiumTone?.rank]}>
        {podiumTone ? <Crown color={podiumTone.iconColor} size={12} strokeWidth={2.8} /> : null}
        <Text style={[styles.rankText, podiumTone?.rankText]}>{entry.rank}</Text>
      </View>

      <View style={styles.rowMain}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={styles.username}>
            {entry.username}
          </Text>
          {isCurrentUser ? (
            <View style={styles.currentUserBadge}>
              <Text style={styles.currentUserBadgeText}>{t('gamification.leaderboard.you')}</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.organization}>
          {entry.organization?.name ?? t('gamification.leaderboard.noOrganization')}
        </Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.statPill}>
          <Trophy color={Palette.primary} size={12} />
          <Text style={styles.statText}>
            {t('gamification.leaderboard.level', { value: formatNumber(entry.level) })}
          </Text>
        </View>
        <View style={styles.statPill}>
          <Car color={Palette.primary} size={12} />
          <Text style={styles.statText}>
            {t('gamification.leaderboard.ridesValue', {
              value: formatNumber(entry.ridesCompleted),
            })}
          </Text>
        </View>
        <View style={styles.statPill}>
          <Leaf color={Palette.primary} size={12} />
          <Text style={styles.statText}>{formatNumber(entry.totalCo2Saved, 1)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  content: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl + Spacing.md,
    gap: Spacing.md,
  },
  contentWithStickyUser: {
    paddingBottom: 132,
  },
  controls: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  communityNote: {
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.primary,
    backgroundColor: Palette.primarySurface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 2,
  },
  communityLabel: {
    color: Palette.primaryDark,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  communityName: {
    color: Palette.primaryDark,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
  itemSeparator: {
    height: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.cardSoft,
  },
  rowCompact: {
    ...Shadow.card,
  },
  rowGold: {
    borderLeftWidth: 4,
    borderLeftColor: Palette.rankGold,
    borderColor: Palette.border,
    backgroundColor: Palette.rankGoldSurface,
  },
  rowSilver: {
    borderLeftWidth: 4,
    borderLeftColor: Palette.rankSilver,
    borderColor: Palette.border,
    backgroundColor: Palette.rankSilverSurface,
  },
  rowBronze: {
    borderLeftWidth: 4,
    borderLeftColor: Palette.rankBronze,
    borderColor: Palette.border,
    backgroundColor: Palette.rankBronzeSurface,
  },
  rowCurrentUser: {
    borderColor: Palette.primary,
  },
  rowPressed: {
    opacity: 0.84,
  },
  rank: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.backgroundMuted,
  },
  rankGold: {
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.rankGold,
  },
  rankSilver: {
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.rankSilver,
  },
  rankBronze: {
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.rankBronze,
  },
  rankText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    lineHeight: 16,
  },
  rankTextStrong: {
    color: Palette.text,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minWidth: 0,
  },
  username: {
    flexShrink: 1,
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  currentUserBadge: {
    flexShrink: 0,
    borderRadius: Radii.pill,
    backgroundColor: Palette.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  currentUserBadgeText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  organization: {
    marginTop: 2,
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  stats: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  statPill: {
    minWidth: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
  },
  statText: {
    color: Palette.text,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  statusCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.cardSoft,
  },
  errorCard: {
    backgroundColor: Palette.dangerSurface,
    borderColor: Palette.danger,
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
  stickyCurrentUserWrap: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.lg,
    maxWidth: 820,
    alignSelf: 'center',
  },
});
