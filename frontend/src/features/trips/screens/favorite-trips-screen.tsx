import { useRouter } from 'expo-router';
import { Star } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { FavoriteTripCard } from '@/features/trips/components/favorite-trip-card';
import { useFavoriteTrips, useToggleFavoriteTrip } from '@/features/trips/queries';
import { mapErrorToMessageKey } from '@/shared/api';
import { popOrReplace } from '@/shared/navigation/back';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

export default function FavoriteTripsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const session = useRequireAuth();
  const isAuthenticated = Boolean(session.data?.user);
  const favoritesQuery = useFavoriteTrips(isAuthenticated);
  const favoriteMutation = useToggleFavoriteTrip();
  const [favoriteErrorMessage, setFavoriteErrorMessage] = useState('');

  const trips = favoritesQuery.data ?? [];
  const isLoading = session.isPending || (isAuthenticated && favoritesQuery.isLoading);
  const loadErrorMessage = favoritesQuery.error
    ? t(mapErrorToMessageKey(favoritesQuery.error))
    : '';
  const pendingFavoriteTripId = favoriteMutation.isPending
    ? favoriteMutation.variables?.tripId
    : null;

  function handleBack() {
    popOrReplace(router, '/(tabs)/profile');
  }

  function handleOpenTripDetails(tripId: string) {
    router.push({
      pathname: '/trips/[id]',
      params: { id: tripId, from: 'favorites' },
    });
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

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{
          onPress: handleBack,
          accessibilityLabel: t('viewProfile.back'),
        }}
        subtitle={t('favoriteTrips.screenSubtitle')}
        title={t('favoriteTrips.screenTitle')}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={() => {
              void favoritesQuery.refetch();
            }}
            refreshing={favoritesQuery.isRefetching}
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={Palette.primary} size="small" />
            <Text style={styles.statusText}>{t('favoriteTrips.loading')}</Text>
          </View>
        ) : null}

        {!isLoading && loadErrorMessage ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{loadErrorMessage}</Text>
          </View>
        ) : null}

        {favoriteErrorMessage ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{favoriteErrorMessage}</Text>
          </View>
        ) : null}

        {!isLoading && !loadErrorMessage && trips.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Star color={Palette.warning} fill={Palette.warning} size={22} strokeWidth={2.3} />
            </View>
            <Text style={styles.emptyTitle}>{t('favoriteTrips.empty.title')}</Text>
            <Text style={styles.emptyText}>{t('favoriteTrips.empty.description')}</Text>
          </View>
        ) : null}

        {trips.length > 0 ? (
          <View style={styles.list}>
            {trips.map((trip) => (
              <FavoriteTripCard
                isUnfavoritePending={pendingFavoriteTripId === trip.id}
                key={trip.id}
                onPress={handleOpenTripDetails}
                onUnfavorite={(tripId) => handleRemoveFavorite(tripId)}
                trip={trip}
              />
            ))}
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
    gap: Spacing.md,
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
  emptyCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.warningSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  emptyTitle: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
    lineHeight: 21,
  },
});
