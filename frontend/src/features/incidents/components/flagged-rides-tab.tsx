import { useRouter } from 'expo-router';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useFlaggedRides } from '@/features/incidents/queries';
import type { AdminFlaggedRideListItemDto } from '@/features/incidents/types';
import { mapErrorToMessageKey } from '@/shared/api';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

function formatDateTime(value: string, lang: Lang) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat(lang, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(parsed));
}

type RowProps = {
  ride: AdminFlaggedRideListItemDto;
  onPress: () => void;
};

function FlaggedRideRow({ ride, onPress }: RowProps) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage ?? i18n.language) ?? 'es') as Lang;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.iconCircle}>
        <AlertTriangle color={Palette.danger} size={18} strokeWidth={2.25} />
      </View>
      <View style={styles.info}>
        <Text numberOfLines={1} style={styles.route}>
          {`${ride.originLabel} → ${ride.destinationLabel}`}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {t('admin.flagged.row.driverLabel', { name: ride.driverName })}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {t('admin.flagged.row.lastIncident', {
            when: formatDateTime(ride.lastIncidentAt, lang),
          })}
        </Text>
      </View>
      <View style={styles.trailing}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{String(ride.incidentCount)}</Text>
        </View>
        <ChevronRight color={Palette.textSecondary} size={18} />
      </View>
    </Pressable>
  );
}

export function FlaggedRidesTab({ enabled = true }: { enabled?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const ridesQuery = useFlaggedRides(enabled);

  const items: AdminFlaggedRideListItemDto[] = useMemo(() => {
    return (ridesQuery.data?.pages ?? []).flatMap((page) => page.items);
  }, [ridesQuery.data?.pages]);

  const errorMessage =
    ridesQuery.error && !ridesQuery.isRefetching ? t(mapErrorToMessageKey(ridesQuery.error)) : '';
  const isLoading = ridesQuery.isLoading;
  const total = ridesQuery.data?.pages?.[0]?.total ?? 0;

  const handleOpen = (ride: AdminFlaggedRideListItemDto) => {
    router.push({
      pathname: '/admin/rides/[rideId]/review' as never,
      params: { rideId: ride.rideId },
    });
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={Palette.primary} size="small" />
          <Text style={styles.helperText}>{t('admin.flagged.loading')}</Text>
        </View>
      ) : errorMessage ? (
        <View style={[styles.centerContainer, styles.errorBox]}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.helperText}>{t('admin.flagged.empty')}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.helperText}>
            {t('admin.flagged.countSummary', { total: String(total) })}
          </Text>
          <View style={styles.list}>
            {items.map((ride) => (
              <FlaggedRideRow key={ride.rideId} onPress={() => handleOpen(ride)} ride={ride} />
            ))}
          </View>
          {ridesQuery.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              disabled={ridesQuery.isFetchingNextPage}
              onPress={() => {
                void ridesQuery.fetchNextPage();
              }}
              style={({ pressed }) => [
                styles.loadMore,
                pressed && styles.loadMorePressed,
                ridesQuery.isFetchingNextPage && styles.loadMoreDisabled,
              ]}
            >
              {ridesQuery.isFetchingNextPage ? (
                <ActivityIndicator color={Palette.primary} size="small" />
              ) : (
                <Text style={styles.loadMoreText}>{t('incidents.list.loadMore')}</Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.lg,
  },
  list: {
    gap: Spacing.sm,
  },
  row: {
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
  rowPressed: {
    opacity: 0.85,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.dangerSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  route: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  subtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Palette.dangerSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Palette.danger,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  centerContainer: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  helperText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: Palette.dangerSurface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.danger,
    paddingHorizontal: Spacing.lg,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  loadMore: {
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  loadMorePressed: {
    opacity: 0.85,
  },
  loadMoreDisabled: {
    opacity: 0.55,
  },
  loadMoreText: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
