import { useLocalSearchParams, useRouter } from 'expo-router';
import { Layers, Repeat, Search } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FindTripsFiltersSection } from './filters-section';
import { type FindTripsTripType, useFindTripsForm } from './use-find-trips-form';

import { useSession } from '@/features/auth/queries';
import { EventsListSection } from '@/features/events';
import { FavoriteTripCard } from '@/features/trips/components/favorite-trip-card';
import { createTripStyles } from '@/features/trips/create-trip/styles';
import { useFavoriteTrips, useToggleFavoriteTrip } from '@/features/trips/queries';
import { mapErrorToMessageKey } from '@/shared/api';
import { env } from '@/shared/env';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';
import { BrandLogo } from '@/shared/ui/components/brand-logo';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { SegmentedControl } from '@/shared/ui/components/segmented-control';

const GOOGLE_PLACES_API_KEY = env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

function parseCoord(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function parseString(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? '';
}

export default function FindTripsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const session = useSession();
  const isAuthenticated = Boolean(session.data?.user);
  const favoritesQuery = useFavoriteTrips(isAuthenticated);
  const favoriteMutation = useToggleFavoriteTrip();
  const [favoriteErrorMessage, setFavoriteErrorMessage] = useState('');

  const {
    form,
    updateField,
    originLocation,
    destinationLocation,
    applyPlaceSelection,
    clearPlaceSelection,
    buildSearchPayload,
    validationError,
  } = useFindTripsForm();

  const incomingParams = useLocalSearchParams<{
    destinationLabel?: string | string[];
    destinationLat?: string | string[];
    destinationLng?: string | string[];
    date?: string | string[];
  }>();
  const lastAppliedKey = useRef<string>('');

  // Pre-fill destination + date when the user arrives via "Find trips to this
  // event" from the event details screen. The router params persist on the tab
  // until replaced; we apply them once per unique combo so manual edits on the
  // form aren't reverted on every render.
  useEffect(() => {
    const destinationLabel = parseString(incomingParams.destinationLabel).trim();
    const destinationLat = parseCoord(incomingParams.destinationLat);
    const destinationLng = parseCoord(incomingParams.destinationLng);
    const date = parseString(incomingParams.date).trim();
    if (!destinationLabel || destinationLat === null || destinationLng === null) return;
    const key = `${destinationLabel}|${destinationLat}|${destinationLng}|${date}`;
    if (lastAppliedKey.current === key) return;
    lastAppliedKey.current = key;
    applyPlaceSelection('destination', {
      address: destinationLabel,
      latitude: destinationLat,
      longitude: destinationLng,
    });
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      updateField('date', date);
    }
  }, [
    applyPlaceSelection,
    incomingParams.date,
    incomingParams.destinationLabel,
    incomingParams.destinationLat,
    incomingParams.destinationLng,
    updateField,
  ]);

  const favorites = favoritesQuery.data ?? [];
  const previewFavorites = favorites.slice(0, 3);
  const pendingFavoriteTripId = favoriteMutation.isPending
    ? favoriteMutation.variables?.tripId
    : null;

  function handleOpenTripDetails(tripId: string) {
    router.push({ pathname: '/trips/[id]', params: { id: tripId, from: 'find' } });
  }

  function handleSeeAllFavorites() {
    router.push('/trips/favorites');
  }

  async function handleRemoveFavorite(tripId: string) {
    setFavoriteErrorMessage('');
    favoriteMutation.reset();
    try {
      await favoriteMutation.mutateAsync({ tripId, isFavorite: true });
    } catch (error) {
      setFavoriteErrorMessage(t(mapErrorToMessageKey(error)));
    }
  }

  function handleSearch() {
    const payload = buildSearchPayload();
    if (!payload) return;
    router.push({
      pathname: '/trips/search',
      params: {
        originLabel: payload.origin.label,
        originLat: String(payload.origin.lat),
        originLng: String(payload.origin.lng),
        destinationLabel: payload.destination.label,
        destinationLat: String(payload.destination.lat),
        destinationLng: String(payload.destination.lng),
        date: payload.date,
        radiusKm: String(payload.radiusKm),
        seatsNeeded: String(payload.seatsNeeded),
        earliestDeparture: form.earliestDeparture ?? '',
        tripType: form.tripType,
      },
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        rightAction={<BrandLogo accessibilityLabel={t('header.brand')} size="compact" />}
        subtitle={t('header.findSubtitle')}
        title={t('header.findTitle')}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SegmentedControl<FindTripsTripType>
          onChange={(next) => updateField('tripType', next)}
          options={[
            {
              value: 'all',
              label: t('findTrips.tripType.all'),
              icon: (
                <Layers
                  color={form.tripType === 'all' ? Palette.primaryDark : Palette.textSecondary}
                  size={14}
                />
              ),
            },
            {
              value: 'recurring',
              label: t('findTrips.tripType.recurring'),
              icon: (
                <Repeat
                  color={
                    form.tripType === 'recurring' ? Palette.primaryDark : Palette.textSecondary
                  }
                  size={14}
                />
              ),
            },
          ]}
          value={form.tripType}
        />

        <FindTripsFiltersSection
          apiKey={GOOGLE_PLACES_API_KEY}
          destinationLocation={destinationLocation}
          form={form}
          onChangeField={updateField}
          onClearDestinationPlace={() => clearPlaceSelection('destination')}
          onClearOriginPlace={() => clearPlaceSelection('origin')}
          onSelectDestinationPlace={(place) => applyPlaceSelection('destination', place)}
          onSelectOriginPlace={(place) => applyPlaceSelection('origin', place)}
          originLocation={originLocation}
          validationError={validationError}
        />

        {validationError ? (
          <Text style={createTripStyles.backendErrorText}>
            {t('findTrips.validation.locationRequired')}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={handleSearch}
          style={({ pressed }) => [
            createTripStyles.submitButton,
            pressed && createTripStyles.submitButtonPressed,
          ]}
        >
          <View style={createTripStyles.submitButtonContent}>
            <Search color={Palette.textOnPrimary} size={20} />
            <Text style={createTripStyles.submitButtonText}>{t('findTrips.searchButton')}</Text>
          </View>
        </Pressable>

        <EventsListSection
          isAuthenticated={isAuthenticated}
          origin={
            originLocation ? { lat: originLocation.latitude, lng: originLocation.longitude } : null
          }
        />

        {isAuthenticated ? (
          <View style={styles.favoritesSection}>
            <View style={styles.favoritesHeader}>
              <Text style={styles.sectionLabel}>{t('findTrips.favorites.sectionTitle')}</Text>
              {previewFavorites.length > 0 ? (
                <Pressable accessibilityRole="button" hitSlop={6} onPress={handleSeeAllFavorites}>
                  <Text style={styles.seeAllLink}>{t('findTrips.favorites.seeAll')}</Text>
                </Pressable>
              ) : null}
            </View>
            {favoriteErrorMessage ? (
              <Text style={styles.favoriteError}>{favoriteErrorMessage}</Text>
            ) : null}
            {previewFavorites.length > 0 ? (
              <View style={styles.favoritesList}>
                {previewFavorites.map((trip) => (
                  <FavoriteTripCard
                    isUnfavoritePending={pendingFavoriteTripId === trip.id}
                    key={trip.id}
                    onPress={handleOpenTripDetails}
                    onUnfavorite={handleRemoveFavorite}
                    trip={trip}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.favoritesEmptyText}>{t('findTrips.favorites.empty')}</Text>
            )}
          </View>
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
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl + Spacing.md,
    // Spacing rule (shared with create-trip): the gap between sections is
    // `Spacing.xxxl` (32). Each section's internal title→content gap is
    // `Spacing.sm` (8). The 4× ratio groups each title tightly with its
    // card and leaves generous breathing room above.
    gap: Spacing.xxxl,
  },
  sectionLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.xs,
    marginTop: Spacing.xs,
  },
  favoritesSection: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  favoritesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAllLink: {
    color: Palette.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  favoritesList: {
    gap: Spacing.sm,
  },
  favoriteError: {
    color: Palette.danger,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    paddingHorizontal: Spacing.xs,
  },
  favoritesEmptyText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    paddingHorizontal: Spacing.xs,
    fontStyle: 'italic',
  },
});
