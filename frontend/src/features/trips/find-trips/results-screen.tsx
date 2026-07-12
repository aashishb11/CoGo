import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Map as MapIcon, SlidersHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSession } from '@/features/auth/queries';
import { useCreateTripBookings } from '@/features/bookings/queries';
import {
  type DriverTripDto,
  type RideSearchItem,
  type SearchRidesInput,
} from '@/features/trips/api';
import { PassengerTripCard } from '@/features/trips/components/passenger-trip-card';
import { RequestJoinModal } from '@/features/trips/find-trips/request-join-modal';
import {
  TopRoutesMapModal,
  type TopRouteMapItem,
} from '@/features/trips/find-trips/top-routes-map-modal';
import {
  useFavoriteTripIds,
  useSearchRides,
  useToggleFavoriteTrip,
  useTripRides,
} from '@/features/trips/queries';
import { mapErrorToMessageKey } from '@/shared/api';
import { type TextKey } from '@/shared/i18n';
import { openUserProfile } from '@/shared/navigation/open-user-profile';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';
import { Accordion } from '@/shared/ui/components/accordion';
import { FilterPillGroup } from '@/shared/ui/components/filter-pill-group';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

type RequestTripType = 'sporadic' | 'recurring';
type TripTypeFilter = 'all' | 'recurring';
type SmokeFilter = 'allowed' | 'notAllowed';
type MusicFilter = 'none' | 'pop' | 'reggaeton' | 'rock' | 'electronic' | 'indie';
type ConversationFilter = 'quiet' | 'casual' | 'chatty';

function parseEarliestDeparture(raw: string): string | null {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null;
}

function parseTripTypeFilter(raw: string): TripTypeFilter {
  return raw === 'recurring' ? 'recurring' : 'all';
}

/**
 * Returns the local hour-of-day in minutes [0-1439] for a ride's scheduled
 * departure, or null if unparseable. Used to compare against the user-picked
 * earliest-departure HH:mm threshold.
 */
function rideMinuteOfDay(ride: RideSearchItem): number | null {
  const date = new Date(ride.scheduledDeparture);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
}

function thresholdMinuteOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function parseSmoke(raw: string): SmokeFilter | null {
  return raw === 'allowed' || raw === 'notAllowed' ? raw : null;
}

function parseMusic(raw: string): MusicFilter | null {
  if (
    raw === 'none' ||
    raw === 'pop' ||
    raw === 'reggaeton' ||
    raw === 'rock' ||
    raw === 'electronic' ||
    raw === 'indie'
  ) {
    return raw;
  }
  return null;
}

function parseConversation(raw: string): ConversationFilter | null {
  return raw === 'quiet' || raw === 'casual' || raw === 'chatty' ? raw : null;
}

const SMOKE_OPTIONS: { value: SmokeFilter; labelKey: TextKey }[] = [
  { value: 'notAllowed', labelKey: 'findTrips.smoke.notAllowed' },
  { value: 'allowed', labelKey: 'findTrips.smoke.allowed' },
];

const MUSIC_OPTIONS: { value: MusicFilter; labelKey: TextKey }[] = [
  { value: 'none', labelKey: 'findTrips.music.none' },
  { value: 'pop', labelKey: 'createTrip.preferences.music.pop' },
  { value: 'reggaeton', labelKey: 'createTrip.preferences.music.reggaeton' },
  { value: 'rock', labelKey: 'createTrip.preferences.music.rock' },
  { value: 'electronic', labelKey: 'createTrip.preferences.music.electronic' },
  { value: 'indie', labelKey: 'createTrip.preferences.music.indie' },
];

const CONVERSATION_OPTIONS: { value: ConversationFilter; labelKey: TextKey }[] = [
  { value: 'quiet', labelKey: 'createTrip.preferences.conversation.quiet' },
  { value: 'casual', labelKey: 'createTrip.preferences.conversation.casual' },
  { value: 'chatty', labelKey: 'createTrip.preferences.conversation.chatty' },
];

function rideToTripView(ride: RideSearchItem): DriverTripDto {
  const seatsAvailable = Math.max(0, ride.seatsOffered - ride.seatsOccupied);
  return {
    id: ride.tripId,
    type: ride.trip.tripType,
    origin: ride.origin,
    destination: ride.destination,
    departureAt: ride.scheduledDeparture,
    seatsOffered: ride.seatsOffered,
    seatsAvailable,
    status: 'active',
    driverId: ride.trip.driverId,
    driver: {
      userId: ride.trip.driverId,
      fullName: ride.trip.driverName,
      conversationStyle: ride.trip.conversationStyle,
      smokeAllowed: ride.trip.smokeAllowed,
      musicAllowed: ride.trip.musicAllowed,
      musicGenre: ride.trip.musicGenre,
    },
    conversationStyle: ride.trip.conversationStyle,
    smokeAllowed: ride.trip.smokeAllowed,
    musicAllowed: ride.trip.musicAllowed,
    musicGenre: ride.trip.musicGenre,
    carModelBrand: ride.trip.carModelBrand,
    carModelName: ride.trip.carModelName,
  };
}

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function getRideId(ride: RideSearchItem | undefined) {
  const id = ride?.id?.trim();
  if (id) return id;

  const legacyRideId = (ride as (RideSearchItem & { rideId?: unknown }) | undefined)?.rideId;
  return typeof legacyRideId === 'string' ? legacyRideId.trim() : '';
}

function getParamText(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  const record = value as { name?: unknown; brand?: unknown; model?: unknown; value?: unknown };
  for (const candidate of [record.name, record.brand, record.model, record.value]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return '';
}

function formatParamNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function paramsToSearchInput(
  params: Record<string, string | string[] | undefined>,
): SearchRidesInput | null {
  const originLat = Number(readParam(params.originLat));
  const originLng = Number(readParam(params.originLng));
  const destinationLat = Number(readParam(params.destinationLat));
  const destinationLng = Number(readParam(params.destinationLng));
  const radiusKm = Number(readParam(params.radiusKm));
  const seatsNeeded = Number(readParam(params.seatsNeeded));
  const date = readParam(params.date);
  const originLabel = readParam(params.originLabel);
  const destinationLabel = readParam(params.destinationLabel);

  if (
    !date ||
    !originLabel ||
    !destinationLabel ||
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLng) ||
    !Number.isFinite(destinationLat) ||
    !Number.isFinite(destinationLng) ||
    !Number.isFinite(radiusKm) ||
    !Number.isFinite(seatsNeeded)
  ) {
    return null;
  }

  return {
    origin: { label: originLabel, lat: originLat, lng: originLng },
    destination: { label: destinationLabel, lat: destinationLat, lng: destinationLng },
    date,
    radiusKm,
    seatsNeeded,
  };
}

export default function SearchResultsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const session = useSession();
  const currentUserId = session.data?.user?.id ?? null;

  const searchInput = useMemo(() => paramsToSearchInput(params), [params]);
  const earliestDeparture = useMemo(
    () => parseEarliestDeparture(readParam(params.earliestDeparture)),
    [params.earliestDeparture],
  );
  const tripTypeFilter = useMemo(
    () => parseTripTypeFilter(readParam(params.tripType)),
    [params.tripType],
  );

  // Filters seed from URL so going back from trip-details / user-profile
  // (which `router.replace` here with the same params bag) restores the
  // exact filter state the user had selected.
  const [smoke, setSmoke] = useState<SmokeFilter | null>(() => parseSmoke(readParam(params.smoke)));
  const [music, setMusic] = useState<MusicFilter | null>(() => parseMusic(readParam(params.music)));
  const [conversation, setConversation] = useState<ConversationFilter | null>(() =>
    parseConversation(readParam(params.conversation)),
  );
  const [requestTripId, setRequestTripId] = useState<string | null>(null);
  const [requestInitialRideId, setRequestInitialRideId] = useState<string | null>(null);
  const [requestInitialRide, setRequestInitialRide] = useState<RideSearchItem | null>(null);
  const [requestTripType, setRequestTripType] = useState<RequestTripType | null>(null);
  const [favoriteErrorMessage, setFavoriteErrorMessage] = useState('');
  const [isMapVisible, setIsMapVisible] = useState(false);
  // 'slide' for natural opens/closes; 'none' when restoring the modal after a
  // trip-details round trip so the user doesn't see it slide back in.
  const [mapAnimation, setMapAnimation] = useState<'slide' | 'none'>('slide');
  // Set when the user opens trip details from the map. Read on next focus to
  // automatically reopen the map modal so they don't lose their place.
  const shouldReopenMapRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (shouldReopenMapRef.current) {
        shouldReopenMapRef.current = false;
        setMapAnimation('none');
        setIsMapVisible(true);
      }
    }, []),
  );

  // After a no-animation reopen, swap back to 'slide' on the next tick so the
  // user's manual close (X button) still animates out smoothly.
  useEffect(() => {
    if (isMapVisible && mapAnimation === 'none') {
      const timeoutId = setTimeout(() => setMapAnimation('slide'), 50);
      return () => clearTimeout(timeoutId);
    }
  }, [isMapVisible, mapAnimation]);

  const ridesQuery = useSearchRides(searchInput);
  const favoriteIdsQuery = useFavoriteTripIds(Boolean(currentUserId));
  const favoriteMutation = useToggleFavoriteTrip();
  const requestMutation = useCreateTripBookings();
  const tripRidesQuery = useTripRides(requestTripId);
  const errorMessage = ridesQuery.error ? t(mapErrorToMessageKey(ridesQuery.error)) : '';
  const requestErrorMessage = requestMutation.error
    ? t(mapErrorToMessageKey(requestMutation.error))
    : tripRidesQuery.error
      ? t(mapErrorToMessageKey(tripRidesQuery.error))
      : '';

  const filteredRides = useMemo(() => {
    const rides = ridesQuery.data ?? [];
    const earliestThreshold = earliestDeparture ? thresholdMinuteOfDay(earliestDeparture) : null;
    return rides.filter((ride) => {
      if (currentUserId && ride.trip.driverId === currentUserId) return false;
      if (tripTypeFilter === 'recurring' && ride.trip.tripType !== 'recurring') return false;
      if (earliestThreshold !== null) {
        const minute = rideMinuteOfDay(ride);
        if (minute !== null && minute < earliestThreshold) return false;
      }
      if (smoke === 'allowed' && !ride.trip.smokeAllowed) return false;
      if (smoke === 'notAllowed' && ride.trip.smokeAllowed) return false;
      if (music === 'none' && ride.trip.musicAllowed) return false;
      if (music && music !== 'none') {
        if (!ride.trip.musicAllowed) return false;
        if (ride.trip.musicGenre !== music) return false;
      }
      if (conversation && ride.trip.conversationStyle !== conversation) return false;
      return true;
    });
  }, [
    conversation,
    currentUserId,
    earliestDeparture,
    music,
    ridesQuery.data,
    smoke,
    tripTypeFilter,
  ]);

  const tripViews = useMemo(() => filteredRides.map(rideToTripView), [filteredRides]);
  const topMapRoutes = useMemo<TopRouteMapItem[]>(
    () =>
      filteredRides.slice(0, 5).map((ride) => ({
        tripId: ride.tripId,
        origin: ride.origin,
        destination: ride.destination,
      })),
    [filteredRides],
  );
  const favoriteIds = useMemo(() => new Set(favoriteIdsQuery.data ?? []), [favoriteIdsQuery.data]);
  const pendingFavoriteTripId = favoriteMutation.isPending
    ? favoriteMutation.variables?.tripId
    : null;
  const rawRideCount = ridesQuery.data?.length ?? 0;
  const isLoading = ridesQuery.isFetching;
  const activeFilterCount = (smoke ? 1 : 0) + (music ? 1 : 0) + (conversation ? 1 : 0);

  // Snapshot the current search + filter URL so the detail screens can
  // `router.replace` back to /trips/search with everything intact.
  function buildBackParams() {
    return {
      from: 'search' as const,
      backOriginLabel: readParam(params.originLabel),
      backOriginLat: readParam(params.originLat),
      backOriginLng: readParam(params.originLng),
      backDestinationLabel: readParam(params.destinationLabel),
      backDestinationLat: readParam(params.destinationLat),
      backDestinationLng: readParam(params.destinationLng),
      backDate: readParam(params.date),
      backRadiusKm: readParam(params.radiusKm),
      backSeatsNeeded: readParam(params.seatsNeeded),
      backSmoke: smoke ?? '',
      backMusic: music ?? '',
      backConversation: conversation ?? '',
    };
  }

  function handleOpenTripDetails(tripId: string, rideId?: string | null) {
    const ride = filteredRides.find(
      (item) => item.tripId === tripId && (!rideId || getRideId(item) === rideId),
    );
    router.push({
      pathname: '/trips/[id]',
      params: {
        id: tripId,
        rideId: rideId ?? '',
        rideRole: 'passenger',
        driverId: ride?.trip.driverId ?? '',
        driverName: ride?.trip.driverName ?? '',
        carBrand: getParamText(ride?.trip.carModelBrand),
        carModel: getParamText(ride?.trip.carModelName),
        rideStatus: ride?.status ?? '',
        rideDeparture: ride?.scheduledDeparture ?? '',
        rideOriginLabel: ride?.origin.label ?? '',
        rideOriginLat: formatParamNumber(ride?.origin.lat),
        rideOriginLng: formatParamNumber(ride?.origin.lng),
        rideDestinationLabel: ride?.destination.label ?? '',
        rideDestinationLat: formatParamNumber(ride?.destination.lat),
        rideDestinationLng: formatParamNumber(ride?.destination.lng),
        rideDistanceKm: formatParamNumber(ride?.totalDistanceKm),
        rideDurationMinutes: formatParamNumber(ride?.estimatedDurationMinutes),
        rideCo2Kg: formatParamNumber(ride?.estimatedCo2SavingsPerSeatKg),
        rideSeatsOffered: formatParamNumber(ride?.seatsOffered),
        rideSeatsOccupied: formatParamNumber(ride?.seatsOccupied),
        ...buildBackParams(),
      },
    });
  }

  function handleOpenTripDetailsFromMap(tripId: string) {
    shouldReopenMapRef.current = true;
    setIsMapVisible(false);
    handleOpenTripDetails(tripId);
  }

  function handleOpenDriverProfile(driverId: string) {
    openUserProfile(router, {
      targetUserId: driverId,
      currentUserId,
      extraParams: buildBackParams(),
    });
  }

  function handleOpenRequestModal(
    tripId: string,
    tripType: RequestTripType,
    ride?: RideSearchItem,
  ) {
    requestMutation.reset();
    setRequestTripId(tripId);
    setRequestTripType(tripType);
    setRequestInitialRideId(getRideId(ride) || null);
    setRequestInitialRide(ride ?? null);
  }

  function handleCloseRequestModal() {
    if (requestMutation.isPending) return;
    requestMutation.reset();
    setRequestTripId(null);
    setRequestInitialRideId(null);
    setRequestInitialRide(null);
    setRequestTripType(null);
  }

  async function handleSubmitRequest(input: { rideIds: string[]; message?: string }) {
    if (!requestTripId) return;

    await requestMutation.mutateAsync({
      tripId: requestTripId,
      input,
    });
    setRequestTripId(null);
    setRequestInitialRideId(null);
    setRequestInitialRide(null);
    setRequestTripType(null);
  }

  async function handleToggleFavorite(tripId: string, isFavorite: boolean) {
    setFavoriteErrorMessage('');

    if (!currentUserId) {
      setFavoriteErrorMessage(t('favoriteTrips.error.auth'));
      return;
    }

    favoriteMutation.reset();
    try {
      await favoriteMutation.mutateAsync({ tripId, isFavorite });
    } catch (error) {
      setFavoriteErrorMessage(t(mapErrorToMessageKey(error)));
    }
  }

  function handleClearFilters() {
    setSmoke(null);
    setMusic(null);
    setConversation(null);
  }

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/trips/create');
  }

  function localizeOptions<T extends string>(options: { value: T; labelKey: TextKey }[]) {
    return options.map((option) => ({ value: option.value, label: t(option.labelKey) }));
  }

  const headerSubtitle = searchInput
    ? `${searchInput.origin.label} → ${searchInput.destination.label}`
    : undefined;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{
          onPress: handleBack,
          accessibilityLabel: t('findTrips.results.back'),
        }}
        subtitle={headerSubtitle}
        title={t('findTrips.results.title')}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={() => {
              void ridesQuery.refetch();
            }}
            refreshing={ridesQuery.isRefetching}
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {topMapRoutes.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsMapVisible(true)}
            style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed]}
          >
            <MapIcon color={Palette.primaryDark} size={16} />
            <Text style={styles.mapButtonText}>{t('findTrips.map.button')}</Text>
          </Pressable>
        ) : null}

        <Accordion
          badge={activeFilterCount}
          icon={SlidersHorizontal}
          title={t('findTrips.filters.title')}
        >
          <Text style={styles.filterLabel}>{t('findTrips.smoke.label')}</Text>
          <FilterPillGroup<SmokeFilter>
            onChange={setSmoke}
            options={localizeOptions(SMOKE_OPTIONS)}
            value={smoke}
          />

          <Text style={styles.filterLabel}>{t('findTrips.conversation.label')}</Text>
          <FilterPillGroup<ConversationFilter>
            onChange={setConversation}
            options={localizeOptions(CONVERSATION_OPTIONS)}
            value={conversation}
          />

          <Text style={styles.filterLabel}>{t('findTrips.music.label')}</Text>
          <FilterPillGroup<MusicFilter>
            onChange={setMusic}
            options={localizeOptions(MUSIC_OPTIONS)}
            value={music}
          />

          {activeFilterCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleClearFilters}
              style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
            >
              <Text style={styles.clearButtonText}>{t('findTrips.filters.clear')}</Text>
            </Pressable>
          ) : null}
        </Accordion>

        {!searchInput ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{t('findTrips.validation.locationRequired')}</Text>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={Palette.primary} size="small" />
            <Text style={styles.statusText}>{t('findTrips.searching')}</Text>
          </View>
        ) : null}

        {!isLoading && errorMessage ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {!isLoading && !errorMessage && tripViews.length === 0 && searchInput ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>
              {rawRideCount > 0 ? t('findTrips.emptyAfterFilters') : t('findTrips.empty')}
            </Text>
          </View>
        ) : null}

        {favoriteErrorMessage ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{favoriteErrorMessage}</Text>
          </View>
        ) : null}

        {tripViews.length > 0 ? (
          <View style={styles.list}>
            {tripViews.map((trip, index) => (
              <PassengerTripCard
                key={`${trip.id}-${getRideId(filteredRides[index]) || index}`}
                detailRideId={getRideId(filteredRides[index]) || null}
                isFavorite={favoriteIds.has(trip.id)}
                isFavoritePending={pendingFavoriteTripId === trip.id}
                onDriverPress={handleOpenDriverProfile}
                onPress={handleOpenTripDetails}
                onRequestJoin={(tripId) =>
                  handleOpenRequestModal(
                    tripId,
                    filteredRides[index]?.trip.tripType ?? 'sporadic',
                    filteredRides[index],
                  )
                }
                onToggleFavorite={handleToggleFavorite}
                trip={trip}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
      <RequestJoinModal
        formError={requestErrorMessage}
        initialRide={requestInitialRide}
        initialRideId={requestInitialRideId}
        isLoadingRides={tripRidesQuery.isLoading || tripRidesQuery.isFetching}
        isSubmitting={requestMutation.isPending}
        onClose={handleCloseRequestModal}
        onSubmit={handleSubmitRequest}
        rides={tripRidesQuery.data ?? []}
        tripType={requestTripType}
        visible={requestTripId !== null}
      />
      <TopRoutesMapModal
        animationType={mapAnimation}
        closeLabel={t('findTrips.map.close')}
        emptyLabel={t('findTrips.map.empty')}
        hintLabel={t('findTrips.map.hint')}
        onClose={() => setIsMapVisible(false)}
        onSelectRoute={handleOpenTripDetailsFromMap}
        routes={topMapRoutes}
        searchDestination={searchInput?.destination ?? null}
        searchDestinationLabel={t('findTrips.map.searchDestinationLabel')}
        searchOrigin={searchInput?.origin ?? null}
        searchOriginLabel={t('findTrips.map.searchOriginLabel')}
        title={t('findTrips.map.title')}
        visible={isMapVisible}
        webUnavailableDescription={t('findTrips.map.webUnavailable.description')}
        webUnavailableTitle={t('findTrips.map.webUnavailable.title')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl + Spacing.md,
    gap: Spacing.md,
  },
  filterLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: Spacing.xs,
  },
  clearButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  clearButtonPressed: {
    opacity: 0.7,
  },
  clearButtonText: {
    color: Palette.primaryDark,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  mapButton: {
    minHeight: 34,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.primarySurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  mapButtonPressed: {
    opacity: 0.85,
  },
  mapButtonText: {
    color: Palette.primaryDark,
    fontSize: FontSize.base,
    lineHeight: 18,
    fontWeight: FontWeight.bold,
  },
  list: {
    gap: Spacing.md,
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
});
