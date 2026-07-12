import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { EventCard } from '@/features/events/components/event-card';
import { useCultucatEventsInfiniteSearch } from '@/features/events/queries';
import type { CultucatEventDto } from '@/features/events/types';
import { mapErrorToMessageKey } from '@/shared/api';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';

// Backend matches `startDate ∈ [dateFrom, dateTo]`, so a long-running
// exhibition that opened months ago is invisible unless we query the past
// and filter client-side by `endDate >= today`. Per backend spec, push
// `dateFrom` "a few months back".
const WINDOW_FUTURE_DAYS = 90;
const WINDOW_PAST_DAYS = 90;
const DEFAULT_RADIUS_KM = 50;
// Backend enforces the description-only "either a coordinate radius or a
// municipality" constraint, even though the OpenAPI schema marks both as
// optional. Use the form's origin coords when available; otherwise fall back
// to a municipality.
const FALLBACK_MUNICIPALITY = 'barcelona';

type Origin = { lat: number; lng: number };

type EventsListSectionProps = {
  isAuthenticated: boolean;
  /** When set, search for events within `radiusKm` of this point. */
  origin?: Origin | null;
  radiusKm?: number;
  /** Used when `origin` is not provided. Defaults to Barcelona. */
  municipality?: string;
};

function buildSearchParams({
  origin,
  radiusKm,
  municipality,
}: {
  origin: Origin | null | undefined;
  radiusKm: number;
  municipality: string;
}) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - WINDOW_PAST_DAYS);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + WINDOW_FUTURE_DAYS);
  const range = { dateFrom: start.toISOString(), dateTo: end.toISOString() };
  if (origin) {
    return { ...range, lat: origin.lat, lng: origin.lng, radiusKm };
  }
  return { ...range, municipality };
}

function formatMunicipalityLabel(slug: string): string {
  return slug
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isOngoingOrUpcoming(event: CultucatEventDto, today: number): boolean {
  const end = event.endDate ?? event.startDate;
  if (!end) return true;
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(endMs)) return true;
  return endMs >= today;
}

export function EventsListSection({
  isAuthenticated,
  origin = null,
  radiusKm = DEFAULT_RADIUS_KM,
  municipality = FALLBACK_MUNICIPALITY,
}: EventsListSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const searchParams = useMemo(
    () => buildSearchParams({ origin, radiusKm, municipality }),
    [origin, radiusKm, municipality],
  );
  const queryHint = origin
    ? t('events.list.queryHint.byOrigin')
    : t('events.list.queryHint.byMunicipality', {
        municipality: formatMunicipalityLabel(municipality),
      });
  const query = useCultucatEventsInfiniteSearch(searchParams, isAuthenticated);
  const events = useMemo(() => {
    const items = query.data?.pages.flatMap((page) => page?.items ?? []) ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    // Dedupe by eventId — the upstream paginates by offset and occasionally
    // surfaces the same event on adjacent pages, which would otherwise throw
    // FlatList's "two children with the same key" warning.
    const seen = new Set<string>();
    const deduped: CultucatEventDto[] = [];
    for (const item of items) {
      if (seen.has(item.eventId)) continue;
      seen.add(item.eventId);
      deduped.push(item);
    }
    return deduped.filter((event) => isOngoingOrUpcoming(event, todayMs));
  }, [query.data?.pages]);
  const errorMessage = query.error ? t(mapErrorToMessageKey(query.error)) : '';

  const handleSelectEvent = useCallback(
    (event: CultucatEventDto) => {
      router.push({ pathname: '/events/[id]', params: { id: event.eventId } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: CultucatEventDto }) => (
      <EventCard event={item} onPress={handleSelectEvent} variant="carousel" />
    ),
    [handleSelectEvent],
  );

  const keyExtractor = useCallback((event: CultucatEventDto) => event.eventId, []);

  const handleEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query]);

  const listFooter = useMemo(() => {
    if (!query.isFetchingNextPage) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={Palette.primary} size="small" />
      </View>
    );
  }, [query.isFetchingNextPage]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{t('events.list.sectionTitle')}</Text>
      <Text style={styles.queryHint}>{queryHint}</Text>
      {query.isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Palette.primary} size="small" />
          <Text style={styles.inlineText}>{t('events.list.loading')}</Text>
        </View>
      ) : errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : events.length === 0 ? (
        <Text style={styles.emptyText}>{t('events.list.empty.description')}</Text>
      ) : (
        <FlatList
          contentContainerStyle={styles.carouselContent}
          data={events}
          horizontal
          keyboardShouldPersistTaps="handled"
          keyExtractor={keyExtractor}
          ListFooterComponent={listFooter}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          renderItem={renderItem}
          showsHorizontalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // The parent (find-trips ScrollView) applies `paddingHorizontal: Spacing.xxl`
  // to every child. We escape that here with a negative margin so the
  // carousel can scroll edge-to-edge; the label re-applies the inset so it
  // stays aligned with the other section labels on the screen.
  section: {
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    marginHorizontal: -Spacing.xxl,
  },
  sectionLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.xxl + Spacing.xs,
  },
  queryHint: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    paddingHorizontal: Spacing.xxl + Spacing.xs,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.xs,
  },
  carouselContent: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.xxl,
  },
  footerLoader: {
    // Carousel cards are roughly 200px tall (event-card.tsx CAROUSEL_IMAGE_HEIGHT
    // + body padding + 1-3 lines of text); pin the footer to the same height
    // so justifyContent: 'center' actually puts the spinner at the card mid-line.
    // alignSelf: 'stretch' was ignored by FlatList's footer wrapping.
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  inlineRow: {
    paddingHorizontal: Spacing.xxl + Spacing.xs,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xxl + Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  inlineText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    fontStyle: 'italic',
    paddingHorizontal: Spacing.xxl + Spacing.xs,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    paddingHorizontal: Spacing.xxl + Spacing.xs,
  },
});
