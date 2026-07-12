import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { IncidentRow } from '@/features/incidents/components/incident-row';
import { useAdminIncidents } from '@/features/incidents/queries';
import {
  INCIDENT_CATEGORIES,
  type AdminIncidentListItemDto,
  type IncidentCategory,
} from '@/features/incidents/types';
import { mapErrorToMessageKey } from '@/shared/api';
import type { TextKey } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';

const CATEGORY_LABEL_KEY: Record<IncidentCategory, TextKey> = {
  harassment: 'incidents.category.harassment',
  unsafe_driving: 'incidents.category.unsafe_driving',
  accident: 'incidents.category.accident',
  other: 'incidents.category.other',
};

type TimeWindow = 'all' | '24h' | '7d' | '30d';

const TIME_WINDOW_LABEL_KEY: Record<TimeWindow, TextKey> = {
  all: 'incidents.admin.window.all',
  '24h': 'incidents.admin.window.last24h',
  '7d': 'incidents.admin.window.last7d',
  '30d': 'incidents.admin.window.last30d',
};

const TIME_WINDOW_MS: Record<TimeWindow, number | null> = {
  all: null,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function AdminIncidentsTab({ enabled = true }: { enabled?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();

  const [selectedCategories, setSelectedCategories] = useState<Set<IncidentCategory>>(new Set());
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all');

  const incidentsQuery = useAdminIncidents(enabled);

  const allItems: AdminIncidentListItemDto[] = useMemo(() => {
    return (incidentsQuery.data?.pages ?? []).flatMap((page) => page.items);
  }, [incidentsQuery.data?.pages]);

  // Client-side filtering — the admin list endpoint accepts only page/limit,
  // so categories and time windows are applied against the materialized rows.
  // Acceptable at admin scale; if volume grows we'd move filtering to the BE.
  const filteredItems = useMemo(() => {
    const windowMs = TIME_WINDOW_MS[timeWindow];
    const minTimestamp = windowMs === null ? null : Date.now() - windowMs;
    return allItems.filter((item) => {
      if (selectedCategories.size > 0 && !selectedCategories.has(item.category)) {
        return false;
      }
      if (minTimestamp !== null) {
        const created = Date.parse(item.createdAt);
        if (Number.isNaN(created) || created < minTimestamp) return false;
      }
      return true;
    });
  }, [allItems, selectedCategories, timeWindow]);

  const toggleCategory = (category: IncidentCategory) => {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedCategories(new Set());
    setTimeWindow('all');
  };

  const handleOpenDetail = (incident: AdminIncidentListItemDto) => {
    router.push({
      pathname: '/admin/incidents/[id]' as never,
      params: { id: incident.id },
    });
  };

  const errorMessage =
    incidentsQuery.error && !incidentsQuery.isRefetching
      ? t(mapErrorToMessageKey(incidentsQuery.error))
      : '';
  const isLoading = incidentsQuery.isLoading;
  const total = incidentsQuery.data?.pages?.[0]?.total ?? 0;
  const hasFilters = selectedCategories.size > 0 || timeWindow !== 'all';

  return (
    <View style={styles.container}>
      <View style={styles.filtersGroup}>
        <Text style={styles.filterLabel}>{t('incidents.admin.filter.categoryLabel')}</Text>
        <View style={styles.chipRow}>
          {INCIDENT_CATEGORIES.map((category) => {
            const selected = selectedCategories.has(category);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={category}
                onPress={() => toggleCategory(category)}
                style={({ pressed }) => [
                  styles.filterChip,
                  selected && styles.filterChipSelected,
                  pressed && styles.filterChipPressed,
                ]}
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                  {t(CATEGORY_LABEL_KEY[category])}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.filterLabel}>{t('incidents.admin.filter.windowLabel')}</Text>
        <View style={styles.chipRow}>
          {(Object.keys(TIME_WINDOW_LABEL_KEY) as TimeWindow[]).map((window) => {
            const selected = timeWindow === window;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={window}
                onPress={() => setTimeWindow(window)}
                style={({ pressed }) => [
                  styles.filterChip,
                  selected && styles.filterChipSelected,
                  pressed && styles.filterChipPressed,
                ]}
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                  {t(TIME_WINDOW_LABEL_KEY[window])}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {hasFilters ? (
          <Pressable
            accessibilityRole="button"
            onPress={clearFilters}
            style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
          >
            <Text style={styles.clearButtonText}>{t('incidents.admin.filter.clear')}</Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={Palette.primary} size="small" />
          <Text style={styles.helperText}>{t('incidents.admin.loading')}</Text>
        </View>
      ) : errorMessage ? (
        <View style={[styles.centerContainer, styles.errorBox]}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.helperText}>
            {hasFilters ? t('incidents.admin.empty.filtered') : t('incidents.admin.empty.all')}
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.helperText}>
            {t('incidents.admin.countSummary', {
              shown: String(filteredItems.length),
              total: String(total),
            })}
          </Text>
          <View style={styles.list}>
            {filteredItems.map((incident) => (
              <IncidentRow
                incident={incident}
                key={incident.id}
                onPress={() => handleOpenDetail(incident)}
              />
            ))}
          </View>

          {incidentsQuery.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              disabled={incidentsQuery.isFetchingNextPage}
              onPress={() => {
                void incidentsQuery.fetchNextPage();
              }}
              style={({ pressed }) => [
                styles.loadMore,
                pressed && styles.loadMorePressed,
                incidentsQuery.isFetchingNextPage && styles.loadMoreDisabled,
              ]}
            >
              {incidentsQuery.isFetchingNextPage ? (
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
  filtersGroup: {
    gap: Spacing.sm,
  },
  filterLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  filterChipSelected: {
    borderColor: Palette.primary,
    backgroundColor: Palette.primarySurface,
  },
  filterChipPressed: {
    opacity: 0.85,
  },
  filterChipText: {
    color: Palette.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  filterChipTextSelected: {
    color: Palette.primaryDark,
  },
  clearButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  clearButtonPressed: {
    opacity: 0.7,
  },
  clearButtonText: {
    color: Palette.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  list: {
    gap: Spacing.sm,
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
