import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Calendar,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  PlusCircle,
  Ticket,
  Users,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCultucatEvent } from '@/features/events/queries';
import type { CultucatEventDto } from '@/features/events/types';
import { formatDistanceKm, formatEventDateRange } from '@/features/events/utils/format';
import { useSearchRides } from '@/features/trips/queries';
import { mapErrorToMessageKey } from '@/shared/api';
import { type Lang, toLang } from '@/shared/i18n';
import { popOrReplace } from '@/shared/navigation/back';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

const HERO_HEIGHT = 240;
const RIDES_PREVIEW_LIMIT = 5;
const RIDES_SEARCH_RADIUS_KM = 2;

function splitImageUrls(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

function readParamText(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').trim();
}

function toIsoDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function hasCoords(
  event: CultucatEventDto,
): event is CultucatEventDto & { lat: number; lng: number } {
  return (
    typeof event.lat === 'number' &&
    Number.isFinite(event.lat) &&
    typeof event.lng === 'number' &&
    Number.isFinite(event.lng)
  );
}

export default function EventDetailScreen() {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = useMemo(() => readParamText(params.id), [params.id]);

  const query = useCultucatEvent(eventId ? { eventId } : null);
  const event = query.data ?? null;
  const errorMessage = query.error
    ? t(mapErrorToMessageKey(query.error))
    : !query.isLoading && !eventId
      ? t('events.detail.error')
      : '';
  const canOfferTrip = event ? hasCoords(event) : false;

  function handleBack() {
    popOrReplace(router, '/');
  }

  function handleOpenUrl(url: string | null | undefined) {
    if (!url) return;
    void Linking.openURL(url);
  }

  function handleOfferTrip() {
    if (!event || !hasCoords(event)) return;
    router.push({
      pathname: '/(tabs)/trips/create',
      params: {
        eventId: event.eventId,
        eventTitle: event.title,
        eventLat: String(event.lat),
        eventLng: String(event.lng),
        eventLocation: event.location ?? '',
        eventStartDate: event.startDate ?? '',
        eventEndDate: event.endDate ?? '',
      },
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack, accessibilityLabel: t('events.detail.back') }}
        title={t('events.detail.title')}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {query.isLoading ? (
          <View style={styles.inlineStatus}>
            <ActivityIndicator color={Palette.primary} size="small" />
            <Text style={styles.statusText}>{t('events.detail.loading')}</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.inlineStatus}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : event ? (
          <EventDetailContent
            canOfferTrip={canOfferTrip}
            event={event}
            lang={lang}
            onOpenUrl={handleOpenUrl}
            onOpenTripDetails={(tripId) =>
              router.push({ pathname: '/trips/[id]', params: { id: tripId } })
            }
            onOfferTrip={handleOfferTrip}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

type EventDetailContentProps = {
  canOfferTrip: boolean;
  event: CultucatEventDto;
  lang: Lang;
  onOpenUrl: (url: string | null | undefined) => void;
  onOpenTripDetails: (tripId: string) => void;
  onOfferTrip: () => void;
};

function EventDetailContent({
  canOfferTrip,
  event,
  lang,
  onOpenUrl,
  onOpenTripDetails,
  onOfferTrip,
}: EventDetailContentProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();

  function formatPriceRange(
    min: number | null | undefined,
    max: number | null | undefined,
  ): string {
    if (typeof min === 'number' && typeof max === 'number' && min !== max) {
      return String(t('events.detail.priceRange', { min: String(min), max: String(max) }));
    }
    const single = typeof min === 'number' ? min : typeof max === 'number' ? max : null;
    if (single === null) return '';
    if (single === 0) return String(t('events.detail.priceFree'));
    return String(t('events.detail.priceSingle', { amount: String(single) }));
  }

  const imageUrls = useMemo(() => splitImageUrls(event.imageUrl), [event.imageUrl]);
  const dateLabel = formatEventDateRange(event.startDate, event.endDate, lang);
  const distanceKm = formatDistanceKm(event.distanceFromOriginKm, lang);
  const taxonomyChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: string[] = [];
    for (const item of [...(event.categories ?? []), ...(event.scopes ?? [])]) {
      const label = item?.name?.trim();
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      chips.push(label);
    }
    return chips;
  }, [event.categories, event.scopes]);

  return (
    <>
      <View style={styles.hero}>
        {imageUrls.length === 0 ? (
          <View style={[styles.heroImage, { width: windowWidth }]} />
        ) : imageUrls.length === 1 ? (
          <Image
            accessibilityIgnoresInvertColors
            accessible={false}
            resizeMode="cover"
            source={{ uri: imageUrls[0] }}
            style={[styles.heroImage, { width: windowWidth }]}
          />
        ) : (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.heroScroll}
          >
            {imageUrls.map((url) => (
              <Image
                accessibilityIgnoresInvertColors
                accessible={false}
                key={url}
                resizeMode="cover"
                source={{ uri: url }}
                style={[styles.heroImage, { width: windowWidth }]}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>{event.title}</Text>
        {event.subtitle ? <Text style={styles.subtitle}>{event.subtitle}</Text> : null}
        {event.location ? (
          <View style={styles.metaRow}>
            <MapPin color={Palette.textSecondary} size={16} strokeWidth={2} />
            <Text style={styles.metaText}>{event.location}</Text>
          </View>
        ) : null}
        {dateLabel ? (
          <View style={styles.metaRow}>
            <Calendar color={Palette.textSecondary} size={16} strokeWidth={2} />
            <Text style={styles.metaText}>{dateLabel}</Text>
          </View>
        ) : null}
        {distanceKm ? (
          <Text style={styles.distanceText}>{t('events.detail.distance', { km: distanceKm })}</Text>
        ) : null}
      </View>

      {taxonomyChips.length > 0 ? (
        <View style={styles.chipsRow}>
          {taxonomyChips.map((label) => (
            <View key={label} style={styles.chip}>
              <Text style={styles.chipText}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {event.schedule ? (
        <View style={styles.textBlock}>
          <View style={styles.metaRow}>
            <Clock color={Palette.textSecondary} size={14} strokeWidth={2} />
            <Text style={styles.cardLabel}>{t('events.detail.schedule')}</Text>
          </View>
          <Text style={styles.bodyText}>{event.schedule}</Text>
        </View>
      ) : null}

      {event.description ? (
        <View style={styles.textBlock}>
          <Text style={styles.cardLabel}>{t('events.detail.about')}</Text>
          <Text style={styles.bodyText}>{event.description}</Text>
        </View>
      ) : null}

      {event.priceInfo || event.minPrice !== null || event.maxPrice !== null ? (
        <View style={styles.textBlock}>
          <Text style={styles.cardLabel}>{t('events.detail.price')}</Text>
          <Text style={styles.bodyText}>
            {event.priceInfo?.trim() || formatPriceRange(event.minPrice, event.maxPrice)}
          </Text>
        </View>
      ) : null}

      {event.activityUrl || event.ticketsUrl ? (
        <View style={styles.linksRow}>
          {event.activityUrl ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenUrl(event.activityUrl)}
              style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
            >
              <ExternalLink color={Palette.primaryDark} size={16} strokeWidth={2} />
              <Text style={styles.linkText}>{t('events.detail.openActivity')}</Text>
            </Pressable>
          ) : null}
          {event.ticketsUrl ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenUrl(event.ticketsUrl)}
              style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
            >
              <Ticket color={Palette.primaryDark} size={16} strokeWidth={2} />
              <Text style={styles.linkText}>{t('events.detail.openTickets')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {canOfferTrip ? (
        <View style={styles.offerCardWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={onOfferTrip}
            style={({ pressed }) => [styles.offerCard, pressed && styles.offerCardPressed]}
          >
            <PlusCircle color={Palette.textOnPrimary} size={20} strokeWidth={2.2} />
            <Text style={styles.offerCardTitle}>{t('events.detail.offerTrip')}</Text>
          </Pressable>
        </View>
      ) : null}

      <EventRidesSection event={event} onOpenTripDetails={onOpenTripDetails} />
    </>
  );
}

type EventRidesSectionProps = {
  event: CultucatEventDto;
  onOpenTripDetails: (tripId: string) => void;
};

function EventRidesSection({ event, onOpenTripDetails }: EventRidesSectionProps) {
  const { t } = useTranslation();
  const canSearch = hasCoords(event);
  const searchDate = useMemo(() => toIsoDate(event.startDate), [event.startDate]);

  // Per backend spec, passenger discovery for events is purely geographic.
  // Without a user location signal, fall back to the event coords as the
  // origin too — this returns all rides within 2 km of the venue regardless
  // of where the rider is coming from.
  const searchInput = useMemo(() => {
    if (!canSearch || !searchDate) return null;
    const eventLat = event.lat as number;
    const eventLng = event.lng as number;
    const label = event.location?.trim() || event.title;
    return {
      origin: { label, lat: eventLat, lng: eventLng },
      destination: { label, lat: eventLat, lng: eventLng },
      date: searchDate,
      radiusKm: RIDES_SEARCH_RADIUS_KM,
      seatsNeeded: 1,
    };
  }, [canSearch, searchDate, event.lat, event.lng, event.location, event.title]);

  const ridesQuery = useSearchRides(searchInput);
  const rides = useMemo(
    () => (ridesQuery.data ?? []).slice(0, RIDES_PREVIEW_LIMIT),
    [ridesQuery.data],
  );
  const hasResults = rides.length > 0;

  return (
    <View style={styles.section}>
      <Text style={styles.cardLabel}>{t('events.detail.rides.title')}</Text>
      {!canSearch ? (
        <Text style={styles.helperText}>{t('events.detail.rides.noCoords')}</Text>
      ) : ridesQuery.isLoading ? (
        <View style={styles.inlineRow}>
          <ActivityIndicator color={Palette.primary} size="small" />
          <Text style={styles.statusText}>{t('events.detail.rides.loading')}</Text>
        </View>
      ) : ridesQuery.error ? (
        <Text style={styles.errorText}>{t('events.detail.rides.error')}</Text>
      ) : hasResults ? (
        <View style={styles.ridesList}>
          {rides.map((ride) => (
            <Pressable
              accessibilityRole="button"
              key={ride.id}
              onPress={() => onOpenTripDetails(ride.tripId)}
              style={({ pressed }) => [styles.rideCard, pressed && styles.rideCardPressed]}
            >
              <View style={styles.rideCardHeader}>
                <Text style={styles.rideTime}>{formatRideTime(ride.scheduledDeparture)}</Text>
                <ChevronRight color={Palette.textSecondary} size={18} strokeWidth={2} />
              </View>
              <Text style={styles.rideDriver}>
                {ride.trip.driverName || t('events.detail.rides.unknownDriver')}
              </Text>
              <Text style={styles.rideRoute} numberOfLines={1}>
                {ride.origin.label} → {ride.destination.label}
              </Text>
              <View style={styles.rideMetaRow}>
                <Users color={Palette.textSecondary} size={14} strokeWidth={2} />
                <Text style={styles.rideMetaText}>
                  {t('events.detail.rides.seatsAvailable', {
                    count: Math.max(0, ride.seatsOffered - ride.seatsOccupied),
                  })}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.helperText}>{t('events.detail.rides.empty')}</Text>
      )}
    </View>
  );
}

function formatRideTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
    gap: Spacing.xxl,
  },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  statusText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: Palette.backgroundMuted,
  },
  heroScroll: {
    flex: 1,
  },
  heroImage: {
    height: HERO_HEIGHT,
    backgroundColor: Palette.backgroundMuted,
  },
  section: {
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.sm,
  },
  title: {
    color: Palette.text,
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    lineHeight: FontSize['2xl'] * 1.2,
  },
  subtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  metaText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flexShrink: 1,
  },
  helperText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    fontStyle: 'italic',
  },
  distanceText: {
    color: Palette.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    marginTop: Spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xxl,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Palette.primarySurface,
    borderRadius: Radii.pill,
  },
  chipText: {
    color: Palette.primaryDark,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  textBlock: {
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.sm,
  },
  cardLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bodyText: {
    color: Palette.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    lineHeight: FontSize.sm * 1.5,
  },
  linksRow: {
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.sm,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Palette.primarySurface,
    borderRadius: Radii.md,
  },
  linkButtonPressed: {
    opacity: 0.7,
  },
  linkText: {
    color: Palette.primaryDark,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  ridesList: {
    gap: Spacing.sm,
  },
  rideCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
    ...Shadow.card,
  },
  rideCardPressed: {
    opacity: 0.85,
  },
  rideCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rideTime: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  rideDriver: {
    color: Palette.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  rideRoute: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  rideMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  rideMetaText: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  offerCardWrap: {
    paddingHorizontal: Spacing.xxl,
  },
  offerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.primary,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    ...Shadow.card,
  },
  offerCardPressed: {
    opacity: 0.9,
  },
  offerCardTitle: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
});
