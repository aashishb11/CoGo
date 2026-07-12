import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AgendaCard } from '@/features/agenda/components/agenda-card';
import { DatePillStrip } from '@/features/agenda/components/date-pill-strip';
import { GoogleCalendarSyncDrawer } from '@/features/agenda/components/google-calendar-sync-drawer';
import { InProgressRideCard } from '@/features/agenda/components/in-progress-card';
import {
  buildDateStrip,
  dayKey,
  formatDayHeader,
  groupAgendaByLocalDay,
  startOfLocalDay,
} from '@/features/agenda/utils/dates';
import { useRequireAuth } from '@/features/auth/queries';
import { useCancelMyBooking } from '@/features/bookings/queries';
import { useHeaderName } from '@/features/profile/use-header-name';
import { ReportIncidentSheet } from '@/features/safety/components/report-incident-sheet';
import { type AgendaItem } from '@/features/trips/api';
import {
  useCancelDriverTrip,
  useCancelRideInstance,
  useFavoriteTripIds,
  useMyAgenda,
  useStartRideInstance,
  useToggleFavoriteTrip,
} from '@/features/trips/queries';
import { mapErrorToMessageKey } from '@/shared/api';
import { toLang, type Lang } from '@/shared/i18n';
import { openUserProfile } from '@/shared/navigation/open-user-profile';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { BrandLogo } from '@/shared/ui/components/brand-logo';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

export default function AgendaScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const session = useRequireAuth();
  const isAuthenticated = Boolean(session.data?.user?.id);
  const headerName = useHeaderName();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;

  const agendaQuery = useMyAgenda(isAuthenticated);
  const favoriteIdsQuery = useFavoriteTripIds(isAuthenticated);
  const favoriteMutation = useToggleFavoriteTrip();
  const cancelTrip = useCancelDriverTrip(session.data?.user?.id ?? null);
  const cancelRide = useCancelRideInstance();
  const startRide = useStartRideInstance();
  const cancelMyBooking = useCancelMyBooking();

  const [selected, setSelected] = useState<Date>(() => startOfLocalDay(new Date()));
  const [favoriteErrorMessage, setFavoriteErrorMessage] = useState('');
  const [rideActionErrorMessage, setRideActionErrorMessage] = useState('');
  const [isCalendarSyncOpen, setIsCalendarSyncOpen] = useState(false);
  const [reportRideId, setReportRideId] = useState<string | null>(null);

  const dates = useMemo(() => buildDateStrip(startOfLocalDay(new Date()), 30), []);
  const groups = useMemo(() => groupAgendaByLocalDay(agendaQuery.data ?? []), [agendaQuery.data]);
  const daysWithRides = useMemo(() => new Set(groups.keys()), [groups]);
  const dayItems = useMemo(() => groups.get(dayKey(selected)) ?? [], [groups, selected]);
  const favoriteIds = useMemo(() => new Set(favoriteIdsQuery.data ?? []), [favoriteIdsQuery.data]);
  // "Rides happening right now" — surfaces in_progress rides at the top so the
  // user has a one-tap route to continue the lifecycle (scan boarding /
  // complete / show QR / report incident). Requires the backend to ship
  // `status` on agenda items; gracefully empty until then.
  const inProgressItems = useMemo(
    () => (agendaQuery.data ?? []).filter((item) => item.status === 'in_progress'),
    [agendaQuery.data],
  );

  const subtitle = headerName
    ? t('header.welcome', { name: headerName })
    : t('header.welcomeNoName');

  const isLoading = isAuthenticated && agendaQuery.isLoading;
  const errorMessage = agendaQuery.error ? t(mapErrorToMessageKey(agendaQuery.error)) : '';
  const pendingFavoriteTripId = favoriteMutation.isPending
    ? favoriteMutation.variables?.tripId
    : null;
  const ridesCountLabel =
    dayItems.length === 1
      ? t('agenda.ridesCountOne')
      : t('agenda.ridesCount', { count: dayItems.length });

  function openTrip(item: AgendaItem) {
    const car = item.role === 'passenger' ? item.car : null;
    router.push({
      pathname: '/trips/[id]',
      params: {
        id: item.tripId,
        rideId: item.rideId,
        rideRole: item.role,
        driverId: item.role === 'passenger' ? item.driver.id : '',
        driverName: item.role === 'passenger' ? item.driver.name : '',
        carBrand: car?.brand ?? '',
        carModel: car?.name ?? car?.model ?? '',
        carPlate: car?.plate ?? '',
        from: 'agenda',
      },
    });
  }

  // Live-ride view (driver sees passenger boarded/not-boarded list; passenger
  // sees the driver card). The agenda item already carries the route header
  // data, so we forward it via params — the screen renders the header
  // immediately and only fans out to `/api/rides/:id/bookings` for the
  // driver passenger list.
  function openLiveDetails(item: AgendaItem) {
    const car = item.role === 'passenger' ? item.car : null;
    router.push({
      pathname: '/rides/[rideId]/live',
      params: {
        rideId: item.rideId,
        tripId: item.tripId,
        role: item.role,
        scheduledDeparture: item.scheduledDeparture,
        originLabel: item.origin.label,
        destinationLabel: item.destination.label,
        totalDistanceKm: String(item.totalDistanceKm ?? ''),
        estimatedDurationMinutes: String(item.estimatedDurationMinutes ?? ''),
        estimatedCo2SavingsPerSeatKg: String(item.estimatedCo2SavingsPerSeatKg ?? ''),
        driverName: item.role === 'passenger' ? item.driver.name : '',
        carBrand: car?.brand ?? '',
        carModel: car?.name ?? car?.model ?? '',
        carPlate: car?.plate ?? '',
      },
    });
  }

  function openDriverProfile(driverId: string) {
    openUserProfile(router, {
      targetUserId: driverId,
      currentUserId: session.data?.user?.id ?? null,
    });
  }

  async function handleToggleFavorite(tripId: string, isFavorite: boolean) {
    setFavoriteErrorMessage('');
    favoriteMutation.reset();

    try {
      await favoriteMutation.mutateAsync({ tripId, isFavorite });
    } catch (error) {
      setFavoriteErrorMessage(t(mapErrorToMessageKey(error)));
    }
  }

  function handleCancelTrip(tripId: string) {
    Alert.alert(
      t('myTrips.cancelConfirm.title'),
      t('myTrips.cancelConfirm.message'),
      [
        { text: t('myTrips.cancelConfirm.cancel'), style: 'cancel' },
        {
          text: t('myTrips.cancelConfirm.accept'),
          style: 'destructive',
          onPress: () => {
            void cancelTrip.mutateAsync(tripId).catch(() => {
              // Surfaced via the cancelTrip.error toast on my-trips; here we
              // silently ignore — the agenda will refetch on focus and the
              // user can retry from there if needed.
            });
          },
        },
      ],
      { cancelable: true },
    );
  }

  function handleCancelMyBooking(bookingId: string) {
    Alert.alert(
      t('agenda.cancelMyBookingConfirm.title'),
      t('agenda.cancelMyBookingConfirm.message'),
      [
        { text: t('agenda.cancelMyBookingConfirm.cancel'), style: 'cancel' },
        {
          text: t('agenda.cancelMyBookingConfirm.accept'),
          style: 'destructive',
          onPress: () => {
            void cancelMyBooking.mutateAsync(bookingId).catch(() => {
              // Surface via toast/refetch — keep the screen clean.
            });
          },
        },
      ],
      { cancelable: true },
    );
  }

  function handleCancelRide(rideId: string) {
    Alert.alert(
      t('agenda.cancelRideConfirm.title'),
      t('agenda.cancelRideConfirm.message'),
      [
        { text: t('agenda.cancelRideConfirm.cancel'), style: 'cancel' },
        {
          text: t('agenda.cancelRideConfirm.accept'),
          style: 'destructive',
          onPress: () => {
            void cancelRide.mutateAsync(rideId).catch(() => {
              // Surface via toast/refetch — keep the screen clean.
            });
          },
        },
      ],
      { cancelable: true },
    );
  }

  function handleCompleteRide(rideId: string) {
    setRideActionErrorMessage('');
    router.push({ pathname: '/rides/[rideId]/complete', params: { rideId } });
  }

  function handleStartRide(rideId: string) {
    setRideActionErrorMessage('');
    Alert.alert(
      t('agenda.startRideConfirm.title'),
      t('agenda.startRideConfirm.message'),
      [
        { text: t('agenda.startRideConfirm.cancel'), style: 'cancel' },
        {
          text: t('agenda.startRideConfirm.accept'),
          onPress: () => {
            void startRide.mutateAsync(rideId).catch((error) => {
              setRideActionErrorMessage(t(mapErrorToMessageKey(error)));
            });
          },
        },
      ],
      { cancelable: true },
    );
  }

  function handleScanBoarding(rideId: string) {
    router.push({ pathname: '/rides/[rideId]/scan', params: { rideId } });
  }

  function handleShowBoardingPass(bookingId: string) {
    router.push({ pathname: '/bookings/[bookingId]/boarding-pass', params: { bookingId } });
  }

  function handleReportIncident(rideId: string) {
    // The ActionMenu trigger is itself a BottomDrawer (Modal). RN doesn't
    // stack two visible Modals at once, so we wait for its close animation
    // (~150 ms) to finish before mounting the report sheet — otherwise the
    // scrim shows but the drawer body never appears.
    setTimeout(() => setReportRideId(rideId), 200);
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        rightAction={<BrandLogo accessibilityLabel={t('header.brand')} size="compact" />}
        subtitle={subtitle}
        title={t('tab.agenda.title')}
      />

      {inProgressItems.map((item) => (
        <InProgressRideCard
          item={item}
          key={`inp-${item.rideId}-${item.scheduledDeparture}`}
          onPress={openLiveDetails}
          onScanBoarding={item.role === 'driver' ? handleScanBoarding : undefined}
          onShowBoardingPass={item.role === 'passenger' ? handleShowBoardingPass : undefined}
        />
      ))}

      <View style={styles.stripContainer}>
        <DatePillStrip
          dates={dates}
          daysWithRides={daysWithRides}
          onSelect={setSelected}
          selected={selected}
        />
      </View>

      <Pressable
        accessibilityLabel={t('agenda.calendarSync.openLabel')}
        accessibilityRole="button"
        onPress={() => setIsCalendarSyncOpen(true)}
        style={({ pressed }) => [styles.syncCta, pressed && styles.syncCtaPressed]}
      >
        <Text style={styles.syncCtaLabel}>{t('agenda.calendarSync.title')}</Text>
        <ChevronRight color={Palette.textSecondary} size={18} strokeWidth={2.2} />
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={() => {
              void agendaQuery.refetch();
            }}
            refreshing={agendaQuery.isRefetching}
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{formatDayHeader(selected, lang)}</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{ridesCountLabel}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={Palette.primary} size="small" />
            <Text style={styles.statusText}>{t('agenda.loading')}</Text>
          </View>
        ) : null}

        {!isLoading && errorMessage ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {favoriteErrorMessage ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{favoriteErrorMessage}</Text>
          </View>
        ) : null}

        {rideActionErrorMessage ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{rideActionErrorMessage}</Text>
          </View>
        ) : null}

        {!isLoading && !errorMessage && dayItems.length === 0 ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{t('agenda.empty')}</Text>
          </View>
        ) : null}

        {!isLoading && !errorMessage && dayItems.length > 0 ? (
          <View style={styles.list}>
            {dayItems.map((item) => (
              <AgendaCard
                isFavorite={favoriteIds.has(item.tripId)}
                isFavoritePending={pendingFavoriteTripId === item.tripId}
                item={item}
                key={`${item.rideId}-${item.scheduledDeparture}`}
                onCancelMyRide={item.role === 'passenger' ? handleCancelMyBooking : undefined}
                onCancelRide={
                  item.role === 'driver' && item.tripType === 'recurring'
                    ? handleCancelRide
                    : undefined
                }
                onCancelTrip={item.role === 'driver' ? handleCancelTrip : undefined}
                onCompleteRide={item.role === 'driver' ? handleCompleteRide : undefined}
                onStartRide={item.role === 'driver' ? handleStartRide : undefined}
                onScanBoarding={item.role === 'driver' ? handleScanBoarding : undefined}
                onShowBoardingPass={
                  item.role === 'passenger' && item.myBookingStatus === 'accepted'
                    ? handleShowBoardingPass
                    : undefined
                }
                onReportIncident={handleReportIncident}
                onDriverPress={openDriverProfile}
                onPress={openTrip}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <GoogleCalendarSyncDrawer
        onClose={() => setIsCalendarSyncOpen(false)}
        visible={isCalendarSyncOpen}
      />

      <ReportIncidentSheet
        onClose={() => setReportRideId(null)}
        rideId={reportRideId ?? ''}
        visible={reportRideId !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  stripContainer: {
    backgroundColor: Palette.background,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  scroll: {
    flex: 1,
  },
  container: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl + Spacing.md,
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.title,
    color: Palette.text,
    flex: 1,
    minWidth: 0,
    textTransform: 'capitalize',
  },
  countPill: {
    backgroundColor: Palette.primarySurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radii.pill,
  },
  countPillText: {
    color: Palette.primaryDark,
    fontSize: FontSize.sm,
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
  syncCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    backgroundColor: Palette.background,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  syncCtaPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  syncCtaLabel: {
    flex: 1,
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
});
