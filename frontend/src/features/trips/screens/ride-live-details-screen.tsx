import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  Gauge,
  Leaf,
  User,
  Users,
} from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRequireAuth } from '@/features/auth/queries';
import { useRideBookings } from '@/features/bookings/queries';
import { PassengerMiniCard } from '@/features/trips/components/passenger-mini-card';
import { mapErrorToMessageKey } from '@/shared/api';
import { type Lang, toLang } from '@/shared/i18n';
import { popOrReplace } from '@/shared/navigation/back';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { RouteTimeline } from '@/shared/ui/components/route-timeline';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function formatNumber(value: unknown, digits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDate(value: string, lang: Lang): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(lang, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Live-ride detail screen. Reached from the in-progress ride card on the
 * agenda. Shares the visual format with `trip-details-screen` but is
 * focused on the live phase:
 *   - Driver view: prominent list of passengers with boarded / not-boarded
 *     status fed by `GET /api/rides/:rideId/bookings`.
 *   - Passenger view: trip context and driver card, mirroring the regular
 *     trip-details layout.
 */
export default function RideLiveDetailsScreen() {
  useRequireAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n: i18nHook } = useTranslation();
  const lang = (toLang(i18nHook.resolvedLanguage) ?? 'es') as Lang;
  const params = useLocalSearchParams();

  const rideId = readParam(params.rideId).trim();
  const scheduledDeparture = readParam(params.scheduledDeparture).trim();
  const originLabel = readParam(params.originLabel).trim();
  const destinationLabel = readParam(params.destinationLabel).trim();
  const role = readParam(params.role).trim() === 'driver' ? 'driver' : 'passenger';
  const driverName = readParam(params.driverName).trim();
  const carBrand = readParam(params.carBrand).trim();
  const carModel = readParam(params.carModel).trim();
  const carPlate = readParam(params.carPlate).trim();
  const distanceKmParam = Number(readParam(params.totalDistanceKm));
  const durationMinParam = Number(readParam(params.estimatedDurationMinutes));
  const co2KgParam = Number(readParam(params.estimatedCo2SavingsPerSeatKg));

  // Driver-only: fetch bookings to render the passenger mini-cards. The
  // bookings endpoint is `driverOnly` server-side — for a passenger the
  // fetch would 403, so we keep the query disabled.
  const bookingsQuery = useRideBookings(rideId, role === 'driver');

  const acceptedBookings = useMemo(
    () => (bookingsQuery.data ?? []).filter((booking) => booking.status === 'accepted'),
    [bookingsQuery.data],
  );

  // Refetch bookings every time the screen regains focus so that the boarded
  // chip flips from "not boarded" -> "boarded" right after the driver returns
  // from the scan screen, even if the cache was already populated.
  const bookingsRefetch = bookingsQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      if (role !== 'driver' || !rideId) return;
      void bookingsRefetch();
    }, [bookingsRefetch, rideId, role]),
  );

  const totalDistanceKm = Number.isFinite(distanceKmParam) ? distanceKmParam : null;
  const estimatedDurationMinutes = Number.isFinite(durationMinParam) ? durationMinParam : null;
  const estimatedCo2SavingsPerSeatKg = Number.isFinite(co2KgParam) ? co2KgParam : null;
  const departureTime = scheduledDeparture ? formatTime(scheduledDeparture) : '';
  const departureDate = scheduledDeparture ? formatDate(scheduledDeparture, lang) : '';

  function handleBack() {
    popOrReplace(router, '/(tabs)/agenda');
  }

  function handleOpenPassengerProfile(passengerId: string) {
    if (!passengerId) return;
    router.push({
      pathname: '/users/[id]',
      params: { id: passengerId, from: 'ride-live' },
    });
  }

  function handleCompleteRide() {
    if (!rideId) return;
    router.push({ pathname: '/rides/[rideId]/complete', params: { rideId } });
  }

  const isDriverView = role === 'driver';

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack }}
        subtitle={t('rideLifecycle.live.subtitle')}
        title={t('rideLifecycle.live.title')}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={() => {
              if (isDriverView) void bookingsQuery.refetch();
            }}
            refreshing={bookingsQuery.isRefetching}
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Trip header */}
        <View style={styles.headerCard}>
          {departureTime ? (
            <View style={styles.headerTopRow}>
              <Text style={styles.timeText}>{departureTime}</Text>
              {departureDate ? <Text style={styles.dateText}>{departureDate}</Text> : null}
            </View>
          ) : null}

          {originLabel && destinationLabel ? (
            <View style={styles.routeWrap}>
              <RouteTimeline
                destination={destinationLabel}
                dropoffLabel={t('agenda.dropoff')}
                origin={originLabel}
                pickupLabel={t('agenda.pickup')}
              />
            </View>
          ) : null}

          <View style={styles.metaRow}>
            {totalDistanceKm !== null ? (
              <View style={styles.metaItem}>
                <Gauge color={Palette.textSecondary} size={13} />
                <Text style={styles.metaText}>{`${formatNumber(totalDistanceKm)} km`}</Text>
              </View>
            ) : null}
            {estimatedDurationMinutes !== null ? (
              <View style={styles.metaItem}>
                <Clock color={Palette.textSecondary} size={13} />
                <Text style={styles.metaText}>{`${Math.round(estimatedDurationMinutes)} min`}</Text>
              </View>
            ) : null}
            {estimatedCo2SavingsPerSeatKg !== null ? (
              <View style={styles.metaItem}>
                <Leaf color={Palette.primary} size={13} />
                <Text style={[styles.metaText, styles.metaTextCo2]}>
                  {`${formatNumber(estimatedCo2SavingsPerSeatKg)} kg`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Driver view: passenger mini-cards */}
        {isDriverView ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Users color={Palette.primaryDark} size={16} strokeWidth={2.4} />
              <Text style={styles.cardLabel}>{t('rideLifecycle.live.section.passengers')}</Text>
              {acceptedBookings.length > 0 ? (
                <Text style={styles.sectionCount}>
                  {`${acceptedBookings.filter((booking) => booking.boardedAt).length}/${acceptedBookings.length}`}
                </Text>
              ) : null}
            </View>

            {bookingsQuery.isLoading ? (
              <View style={styles.inlineStatus}>
                <ActivityIndicator color={Palette.primary} size="small" />
                <Text style={styles.statusText}>{t('rideLifecycle.live.passenger.loading')}</Text>
              </View>
            ) : null}

            {!bookingsQuery.isLoading && bookingsQuery.error ? (
              <View style={[styles.inlineStatus, styles.errorStatus]}>
                <Text style={styles.errorText}>{t(mapErrorToMessageKey(bookingsQuery.error))}</Text>
              </View>
            ) : null}

            {!bookingsQuery.isLoading && !bookingsQuery.error && acceptedBookings.length === 0 ? (
              <Text style={styles.helperText}>{t('rideLifecycle.live.empty.driver')}</Text>
            ) : null}

            <View style={styles.miniCardsList}>
              {acceptedBookings.map((booking) => (
                <PassengerMiniCard
                  boarded={Boolean(booking.boardedAt)}
                  key={booking.id}
                  onPress={handleOpenPassengerProfile}
                  passengerId={booking.passengerId}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Passenger view: driver + car details (mirrors trip-details) */}
        {!isDriverView && driverName ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <User color={Palette.primaryDark} size={16} strokeWidth={2.4} />
              <Text style={styles.cardLabel}>{t('rideLifecycle.live.section.driver')}</Text>
            </View>
            <View style={styles.driverCard}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>{driverName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.driverTextWrap}>
                <Text numberOfLines={1} style={styles.driverName}>
                  {driverName}
                </Text>
                {carBrand || carModel ? (
                  <Text numberOfLines={1} style={styles.driverSubtitle}>
                    {[carBrand, carModel].filter(Boolean).join(' ')}
                    {carPlate ? ` · ${carPlate}` : ''}
                  </Text>
                ) : null}
              </View>
              {carBrand || carModel ? (
                <Car color={Palette.primaryDark} size={20} />
              ) : (
                <ChevronRight color={Palette.textSecondary} size={18} />
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {isDriverView && rideId ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}>
          <Pressable
            accessibilityLabel={t('rideLifecycle.live.finishRide.label')}
            accessibilityRole="button"
            onPress={handleCompleteRide}
            style={({ pressed }) => [styles.finishButton, pressed && styles.finishButtonPressed]}
          >
            <CheckCircle2 color={Palette.textOnPrimary} size={18} strokeWidth={2.4} />
            <Text style={styles.finishButtonText}>{t('rideLifecycle.live.finishRide.label')}</Text>
          </Pressable>
        </View>
      ) : null}
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
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl + Spacing.md,
    gap: Spacing.xl,
  },
  headerCard: {
    borderRadius: Radii.lg,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    gap: Spacing.lg,
    ...Shadow.cardSoft,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.md,
  },
  timeText: {
    color: Palette.text,
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.extrabold,
  },
  dateText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  routeWrap: {
    paddingVertical: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  metaTextCo2: {
    color: Palette.primary,
    fontWeight: FontWeight.semibold,
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex: 1,
  },
  sectionCount: {
    color: Palette.primaryDark,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  miniCardsList: {
    gap: Spacing.sm,
  },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  errorStatus: {
    backgroundColor: Palette.dangerSurface,
    borderColor: Palette.danger,
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
  helperText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    paddingVertical: Spacing.md,
  },
  driverCard: {
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
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: {
    color: Palette.primaryDark,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  driverTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  driverName: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  driverSubtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  footer: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.md,
    backgroundColor: Palette.backgroundMuted,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.danger,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.lg,
    ...Shadow.cardSoft,
  },
  finishButtonPressed: {
    opacity: 0.85,
  },
  finishButtonText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
