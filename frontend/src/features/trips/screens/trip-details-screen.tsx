import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  Gauge,
  Leaf,
  MessageSquare,
  Music,
  Pencil,
  Play,
  ScanLine,
  ShieldAlert,
  Ticket,
  User,
  UserPlus,
  Users,
  Wind,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
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

import { useRequireAuth } from '@/features/auth/queries';
import { useCreateTripBookings } from '@/features/bookings/queries';
import { TrustedContactSheet } from '@/features/profile/components/trusted-contact-sheet';
import { useTrustedContact } from '@/features/profile/queries';
import { type DriverTripDto, type RideItem } from '@/features/trips/api';
import { RequestJoinModal } from '@/features/trips/find-trips/request-join-modal';
import { backToSearchOrFallback } from '@/features/trips/find-trips/return-to-search';
import { useStartRideInstance, useTripById, useTripRides } from '@/features/trips/queries';
import { derivePhase, formatStartWindowOpensAt } from '@/features/trips/ride-phase';
import { getErrorCode, mapErrorToMessageKey } from '@/shared/api';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { RouteTimeline } from '@/shared/ui/components/route-timeline';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { StatusBadge } from '@/shared/ui/components/status-badge';

function normalizeNumber(value: unknown, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  return value.toFixed(digits);
}

function normalizeDuration(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  return `${Math.round(value)} min`;
}

function normalizeDate(value: unknown, lang: Lang) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.trim();
  }

  return new Intl.DateTimeFormat(lang, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatLongDate(value: unknown, lang: Lang) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.trim();
  }

  return new Intl.DateTimeFormat(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatTimeOnly(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function normalizeRideTime(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.trim();
  }

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function readParamText(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  return raw.trim();
}

function normalizeCarModelText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as { name?: unknown; brand?: unknown; model?: unknown; value?: unknown };
  for (const candidate of [record.name, record.brand, record.model, record.value]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function normalizeTripCarModel(trip: DriverTripDto | null) {
  if (!trip) return null;

  const carModelName = normalizeCarModelText(trip.carModelName);
  if (carModelName) return carModelName;

  const rawCar = trip.car;
  if (typeof rawCar === 'string' && rawCar.trim().length > 0) {
    return rawCar.trim();
  }

  if (rawCar && typeof rawCar === 'object') {
    if (typeof rawCar.model === 'string' && rawCar.model.trim().length > 0) {
      return rawCar.model.trim();
    }

    if (rawCar.model && typeof rawCar.model === 'object') {
      const nestedName = normalizeCarModelText(rawCar.model);
      if (nestedName) return nestedName;
    }

    if (typeof rawCar.name === 'string' && rawCar.name.trim().length > 0) {
      return rawCar.name.trim();
    }
  }

  return null;
}

function normalizeTripCarBrand(trip: DriverTripDto | null) {
  if (!trip) return null;

  const carModelBrand = normalizeCarModelText(trip.carModelBrand);
  if (carModelBrand) return carModelBrand;

  const rawCar = trip.car;
  if (rawCar && typeof rawCar === 'object') {
    if (typeof rawCar.brand === 'string' && rawCar.brand.trim().length > 0) {
      return rawCar.brand.trim();
    }

    if (rawCar.model && typeof rawCar.model === 'object') {
      const nestedBrand = typeof rawCar.model.brand === 'string' ? rawCar.model.brand.trim() : '';
      if (nestedBrand.length > 0) return nestedBrand;
    }
  }

  return null;
}

function normalizeTripCarPlate(trip: DriverTripDto | null) {
  const rawCar = trip?.car;
  if (!rawCar || typeof rawCar !== 'object') {
    return null;
  }

  for (const candidate of [rawCar.plate, rawCar.registration, rawCar.licensePlate]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function normalizeTripPointLabelFromTrip(
  point: DriverTripDto['origin'] | DriverTripDto['destination'] | undefined,
) {
  if (!point) return '-';
  if (typeof point === 'string') return point.trim() || '-';
  if (typeof point.label === 'string' && point.label.trim().length > 0) {
    return point.label.trim();
  }

  return '-';
}

export default function TripDetailsScreen() {
  const { t, i18n: i18nHook } = useTranslation();
  const lang = (toLang(i18nHook.resolvedLanguage) ?? 'es') as Lang;
  const router = useRouter();
  const params = useLocalSearchParams();
  const session = useRequireAuth();
  const id = params.id;
  const rideId = params.rideId;
  const rideRole = params.rideRole;
  const paramDriverId = readParamText(params.driverId);
  const paramDriverName = readParamText(params.driverName);
  const paramCarBrand = readParamText(params.carBrand);
  const paramCarModel = readParamText(params.carModel);
  const paramCarPlate = readParamText(params.carPlate);
  const resolvedTripId = useMemo(() => (typeof id === 'string' ? id.trim() : ''), [id]);
  const resolvedRideId = useMemo(() => (typeof rideId === 'string' ? rideId.trim() : ''), [rideId]);
  const resolvedRideRole = useMemo(() => {
    if (rideRole === 'driver' || rideRole === 'passenger') {
      return rideRole;
    }
    return params.from === 'agenda' ? null : 'passenger';
  }, [params.from, rideRole]);
  const isFromAgenda = params.from === 'agenda';
  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false);
  const [isTrustedContactSheetVisible, setIsTrustedContactSheetVisible] = useState(false);
  const [showRequestSuccess, setShowRequestSuccess] = useState(false);
  const [pendingRequestInput, setPendingRequestInput] = useState<{
    rideIds: string[];
    message?: string;
  } | null>(null);
  const requestMutation = useCreateTripBookings();
  const startRide = useStartRideInstance();
  const trustedContactQuery = useTrustedContact(Boolean(session.data?.user?.id));
  const allTripRidesQuery = useTripRides(resolvedTripId || null, 'all');
  const tripQuery = useTripById(resolvedTripId || null);
  const trip = tripQuery.data ?? null;
  const sortedRides = useMemo(() => {
    return [...(allTripRidesQuery.data ?? [])].sort(
      (a, b) => new Date(a.scheduledDeparture).getTime() - new Date(b.scheduledDeparture).getTime(),
    );
  }, [allTripRidesQuery.data]);

  const driverId = paramDriverId || trip?.driverId || trip?.driver?.userId || null;
  const tripDriverName =
    typeof trip?.driver?.fullName === 'string' && trip.driver.fullName.trim().length > 0
      ? trip.driver.fullName.trim()
      : null;
  const driverName = paramDriverName || tripDriverName;
  const carBrand = paramCarBrand || normalizeTripCarBrand(trip);
  const carModel = paramCarModel || normalizeTripCarModel(trip);
  const carPlate = paramCarPlate || normalizeTripCarPlate(trip);

  const sessionUserId = session.data?.user?.id ?? null;
  const tripDriverUserId = trip?.driverId ?? trip?.driver?.userId ?? null;
  const isCurrentUserDriver = Boolean(
    sessionUserId && tripDriverUserId && sessionUserId === tripDriverUserId,
  );

  const canRequestJoin = !isFromAgenda && !isCurrentUserDriver;
  const shouldShowPassengerContext = resolvedRideRole !== 'driver' && !isCurrentUserDriver;
  const displayRole: 'driver' | 'passenger' | null = isCurrentUserDriver
    ? 'driver'
    : isFromAgenda && (rideRole === 'driver' || rideRole === 'passenger')
      ? rideRole
      : null;
  const hasDriverInfo = shouldShowPassengerContext && Boolean(driverId && driverName);
  const vehicleLine = useMemo(() => {
    const name = [carBrand, carModel].filter(Boolean).join(' ').trim();
    const parts: string[] = [];
    if (name.length > 0) parts.push(name);
    if (carPlate) parts.push(carPlate);
    return parts.join(' · ');
  }, [carBrand, carModel, carPlate]);
  const showVehicleLine = hasDriverInfo && vehicleLine.length > 0;

  const tripRidesQuery = useTripRides(
    canRequestJoin && isRequestModalVisible ? resolvedTripId : null,
  );

  const tripOriginLabel = normalizeTripPointLabelFromTrip(trip?.origin);
  const tripDestinationLabel = normalizeTripPointLabelFromTrip(trip?.destination);

  const tripLoadError = !resolvedTripId
    ? t('passengerTrips.detail.error')
    : tripQuery.error
      ? tripQuery.error instanceof Error && tripQuery.error.message.trim().length > 0
        ? tripQuery.error.message
        : t('passengerTrips.detail.error')
      : '';

  const requestErrorMessage = requestMutation.error
    ? t(mapErrorToMessageKey(requestMutation.error))
    : tripRidesQuery.error
      ? t(mapErrorToMessageKey(tripRidesQuery.error))
      : '';

  const departureTime = useMemo(() => {
    if (!trip) return '';
    if (trip.type === 'recurring' && trip.schedule?.timeOfDay) {
      return trip.schedule.timeOfDay;
    }
    if (trip.type === 'sporadic' && trip.departureAt) {
      return formatTimeOnly(trip.departureAt);
    }
    return '';
  }, [trip]);

  const sporadicLongDate = useMemo(() => {
    if (!trip || trip.type !== 'sporadic' || !trip.departureAt) return '';
    return formatLongDate(trip.departureAt, lang);
  }, [lang, trip]);

  const tripStatus = trip?.status;
  const showTripStatusBadge = tripStatus === 'cancelled' || tripStatus === 'archived';
  const tripStatusLabel = showTripStatusBadge
    ? tripStatus === 'cancelled'
      ? t('passengerTrips.status.cancelled')
      : t('passengerTrips.status.archived')
    : '';

  const co2Value =
    typeof trip?.estimatedCo2SavingsPerSeatKg === 'number'
      ? normalizeNumber(trip.estimatedCo2SavingsPerSeatKg)
      : null;

  function handleBack() {
    backToSearchOrFallback(router, params);
  }

  function handleOpenDriverProfile() {
    if (!driverId) return;
    router.push({
      pathname: '/users/[id]',
      params: {
        ...params,
        id: driverId,
        backTripId: resolvedTripId,
        backRideId: resolvedRideId,
        backTripDetailsFrom: readParamText(params.from),
        from: 'trip-details',
      },
    });
  }

  function handleOpenEditTrip() {
    if (!resolvedTripId) return;
    router.push({
      pathname: '/trips/edit/[id]' as never,
      params: { id: resolvedTripId },
    });
  }

  function handleStartRide(rideId: string) {
    void startRide.mutateAsync(rideId).catch(() => {
      // mutation surfaces the error in its mutation state; the agenda /
      // trip-details ride row will refetch once the ride flips status, so a
      // silent catch is enough here.
    });
  }

  function handleScanRide(rideId: string) {
    router.push({ pathname: '/rides/[rideId]/scan', params: { rideId } });
  }

  function handleCompleteRideFromTrip(rideId: string) {
    router.push({ pathname: '/rides/[rideId]/complete', params: { rideId } });
  }

  function handleReportIncident(rideId: string) {
    router.push({ pathname: '/rides/[rideId]/incident', params: { rideId } });
  }

  function handleOpenRequestModal() {
    if (!canRequestJoin) return;
    setShowRequestSuccess(false);
    requestMutation.reset();
    setIsRequestModalVisible(true);
  }

  function handleCloseRequestModal() {
    if (requestMutation.isPending) return;
    requestMutation.reset();
    setIsRequestModalVisible(false);
  }

  async function handleSubmitRequest(input: { rideIds: string[]; message?: string }) {
    if (!resolvedTripId) return;

    try {
      await requestMutation.mutateAsync({
        tripId: resolvedTripId,
        input,
      });
      setPendingRequestInput(null);
      setIsRequestModalVisible(false);
      setShowRequestSuccess(true);
    } catch (error) {
      if (getErrorCode(error) === 'TRUSTED_CONTACT_REQUIRED') {
        setPendingRequestInput(input);
        setIsTrustedContactSheetVisible(true);
      }
      throw error;
    }
  }

  async function handleTrustedContactSaved() {
    if (!pendingRequestInput || !resolvedTripId) return;

    requestMutation.reset();
    await requestMutation.mutateAsync({
      tripId: resolvedTripId,
      input: pendingRequestInput,
    });
    setPendingRequestInput(null);
    setIsRequestModalVisible(false);
    setShowRequestSuccess(true);
  }

  const hasPrefs =
    typeof trip?.smokeAllowed === 'boolean' ||
    typeof trip?.musicAllowed === 'boolean' ||
    Boolean(trip?.conversationStyle);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack, accessibilityLabel: t('viewProfile.back') }}
        rightAction={
          isCurrentUserDriver && trip ? (
            <Pressable
              accessibilityLabel={t('myTrips.editTrip')}
              accessibilityRole="button"
              hitSlop={10}
              onPress={handleOpenEditTrip}
              style={({ pressed }) => [
                styles.editHeaderButton,
                pressed && styles.editHeaderButtonPressed,
              ]}
            >
              <Pencil color={Palette.textSecondary} size={18} />
            </Pressable>
          ) : null
        }
        title={t('passengerTrips.detail.title')}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={() => {
              void allTripRidesQuery.refetch();
              void tripQuery.refetch();
            }}
            refreshing={allTripRidesQuery.isRefetching || tripQuery.isRefetching}
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        {tripQuery.isLoading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={Palette.primary} size="small" />
            <Text style={styles.infoText}>{t('passengerTrips.detail.loading')}</Text>
          </View>
        ) : null}

        {!tripQuery.isLoading && tripLoadError.length > 0 ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{tripLoadError}</Text>
          </View>
        ) : null}

        {!tripQuery.isLoading && tripLoadError.length === 0 && !trip ? (
          <View style={styles.statusCard}>
            <Text style={styles.infoText}>
              {resolvedTripId ? t('passengerTrips.detail.empty') : t('passengerTrips.detail.error')}
            </Text>
          </View>
        ) : null}

        {!tripQuery.isLoading && tripLoadError.length === 0 && trip ? (
          <>
            {/* ── TRIP CARD ───────────────────────────────────── */}
            <View style={styles.tripCard}>
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  {trip.type ? <TripTypeChip type={trip.type} /> : null}
                  {showTripStatusBadge ? (
                    <StatusBadge
                      label={tripStatusLabel}
                      variant={tripStatus === 'cancelled' ? 'cancelled' : 'archived'}
                    />
                  ) : null}
                  {trip.externalEventContext?.provider === 'cultucat' ? (
                    <EventTagRow eventId={trip.externalEventContext.eventId} />
                  ) : null}
                </View>
                {displayRole ? <RolePill role={displayRole} /> : null}
              </View>

              <RouteTimeline
                destination={tripDestinationLabel}
                destIcon="pin"
                dropoffLabel={t('passengerTrips.dropoff')}
                origin={tripOriginLabel}
                pickupLabel={t('passengerTrips.pickup')}
              />

              {trip.type === 'recurring' && trip.schedule?.daysOfWeek ? (
                <WeekdayStrip days={trip.schedule.daysOfWeek} />
              ) : null}

              {trip.type === 'sporadic' && sporadicLongDate.length > 0 ? (
                <View style={styles.metaItem}>
                  <CalendarDays color={Palette.textSecondary} size={14} />
                  <Text style={styles.metaText}>{sporadicLongDate}</Text>
                </View>
              ) : null}

              {departureTime.length > 0 ||
              typeof trip.seatsOffered === 'number' ||
              co2Value !== null ? (
                <View style={styles.metaRow}>
                  {departureTime.length > 0 ? (
                    <View style={styles.metaItem}>
                      <Clock color={Palette.textSecondary} size={14} />
                      <Text style={styles.metaText}>{departureTime}</Text>
                    </View>
                  ) : null}
                  {typeof trip.seatsOffered === 'number' ? (
                    <View style={styles.metaItem}>
                      <Users color={Palette.textSecondary} size={14} />
                      <Text style={styles.metaText}>{String(trip.seatsOffered)}</Text>
                    </View>
                  ) : null}
                  {co2Value !== null ? (
                    <View style={styles.metaItem}>
                      <Leaf color={Palette.textSecondary} size={14} />
                      <Text style={styles.metaText}>
                        {t('gamification.summary.kgValue', { value: co2Value })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* ── PREFERENCES ─────────────────────────────────── */}
            {hasPrefs ? (
              <View style={styles.prefRow}>
                {typeof trip.smokeAllowed === 'boolean' ? (
                  <PrefChip
                    icon={<Wind color={Palette.primaryDark} size={14} />}
                    label={t('passengerTrips.detail.field.smoker')}
                    value={
                      trip.smokeAllowed
                        ? t('createTrip.preferences.yes')
                        : t('createTrip.preferences.no')
                    }
                  />
                ) : null}
                {typeof trip.musicAllowed === 'boolean' ? (
                  <PrefChip
                    icon={<Music color={Palette.primaryDark} size={14} />}
                    label={t('passengerTrips.detail.field.musicPreference')}
                    value={
                      trip.musicAllowed
                        ? trip.musicGenre
                          ? trip.musicGenre
                          : t('createTrip.preferences.yes')
                        : t('createTrip.preferences.no')
                    }
                  />
                ) : null}
                {trip.conversationStyle ? (
                  <PrefChip
                    icon={<MessageSquare color={Palette.primaryDark} size={14} />}
                    label={t('passengerTrips.detail.field.conversationStyle')}
                    value={trip.conversationStyle}
                  />
                ) : null}
              </View>
            ) : null}

            {/* ── DRIVER + VEHICLE ────────────────────────────── */}
            {hasDriverInfo ? (
              <View style={styles.section}>
                <Text style={styles.cardLabel}>{t('passengerTrips.detail.section.driver')}</Text>
                <Pressable
                  accessibilityLabel={t('passengerTrips.driver.openProfile', {
                    name: driverName ?? '',
                  })}
                  accessibilityRole="button"
                  onPress={handleOpenDriverProfile}
                  style={({ pressed }) => [
                    styles.driverButton,
                    pressed && styles.driverButtonPressed,
                  ]}
                >
                  <View style={styles.driverAvatar}>
                    <Text style={styles.driverAvatarText}>{driverName?.charAt(0) ?? '?'}</Text>
                  </View>
                  <View style={styles.driverTextWrap}>
                    <Text numberOfLines={1} style={styles.driverName}>
                      {driverName ?? ''}
                    </Text>
                    {showVehicleLine ? (
                      <Text numberOfLines={1} style={styles.driverSubtitle}>
                        {vehicleLine}
                      </Text>
                    ) : (
                      <Text style={styles.driverSubtitle}>{t('agenda.passenger.driverRole')}</Text>
                    )}
                  </View>
                  <ChevronRight color={Palette.textSecondary} size={18} />
                </Pressable>
              </View>
            ) : null}

            {/* ── RIDES ───────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.cardLabel}>{t('passengerTrips.detail.section.rides')}</Text>
              {allTripRidesQuery.isLoading ? (
                <View style={styles.inlineRow}>
                  <ActivityIndicator color={Palette.primary} size="small" />
                  <Text style={styles.helperText}>{t('passengerTrips.detail.ridesLoading')}</Text>
                </View>
              ) : sortedRides.length === 0 ? (
                <Text style={styles.helperText}>{t('passengerTrips.detail.ridesEmpty')}</Text>
              ) : (
                <View style={styles.ridesList}>
                  {sortedRides.map((ride) => (
                    <RideRow
                      actions={{
                        onStart: isCurrentUserDriver ? handleStartRide : undefined,
                        onScan: isCurrentUserDriver ? handleScanRide : undefined,
                        onComplete: isCurrentUserDriver ? handleCompleteRideFromTrip : undefined,
                        onReportIncident: handleReportIncident,
                      }}
                      highlighted={
                        ride.id === resolvedRideId ||
                        (resolvedRideId.length === 0 && ride === sortedRides[0])
                      }
                      isDriverViewer={isCurrentUserDriver}
                      key={ride.id}
                      lang={lang}
                      ride={ride}
                    />
                  ))}
                </View>
              )}
            </View>

            {/* ── FEEDBACK / ACTION ───────────────────────────── */}
            {canRequestJoin && showRequestSuccess ? (
              <View style={[styles.statusCard, styles.successCard]}>
                <Text style={styles.successText}>{t('joinTrip.feedback.sent')}</Text>
              </View>
            ) : null}

            {canRequestJoin ? (
              <Pressable
                accessibilityRole="button"
                disabled={requestMutation.isPending}
                onPress={handleOpenRequestModal}
                style={({ pressed }) => [
                  formStyles.primaryButton,
                  pressed && formStyles.primaryButtonPressed,
                  requestMutation.isPending && formStyles.primaryButtonDisabled,
                ]}
              >
                <View style={styles.requestButtonContent}>
                  <UserPlus color={Palette.textOnPrimary} size={18} strokeWidth={2.4} />
                  <Text style={formStyles.primaryButtonText}>{t('joinTrip.requestButton')}</Text>
                </View>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <RequestJoinModal
        formError={requestErrorMessage}
        initialRideId={null}
        isLoadingRides={tripRidesQuery.isLoading || tripRidesQuery.isFetching}
        isSubmitting={requestMutation.isPending}
        onClose={handleCloseRequestModal}
        onSubmit={handleSubmitRequest}
        rides={tripRidesQuery.data ?? []}
        visible={canRequestJoin && isRequestModalVisible}
      />
      <TrustedContactSheet
        contact={trustedContactQuery.data ?? null}
        onClose={() => setIsTrustedContactSheetVisible(false)}
        onSaved={handleTrustedContactSaved}
        visible={isTrustedContactSheetVisible}
      />
    </View>
  );
}

function PrefChip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View style={styles.prefChip}>
      {icon}
      <View style={styles.prefChipText}>
        <Text style={styles.prefChipLabel}>{label}</Text>
        <Text style={styles.prefChipValue}>{value}</Text>
      </View>
    </View>
  );
}

type RideRowActions = {
  onStart?: (rideId: string) => void;
  onScan?: (rideId: string) => void;
  onComplete?: (rideId: string) => void;
  onReportIncident?: (rideId: string) => void;
};

function RideRow({
  ride,
  lang,
  highlighted,
  isDriverViewer,
  actions,
}: {
  ride: RideItem;
  lang: Lang;
  highlighted: boolean;
  isDriverViewer: boolean;
  actions?: RideRowActions;
}) {
  const { t } = useTranslation();
  const seatsAvailable = Math.max(0, ride.seatsOffered - ride.seatsOccupied);
  const phase = derivePhase({ status: ride.status, scheduledDeparture: ride.scheduledDeparture });
  const rideStatusVariant =
    ride.status === 'completed'
      ? 'archived'
      : ride.status === 'cancelled'
        ? 'cancelled'
        : ride.status === 'in_progress'
          ? 'in_progress'
          : 'active';
  const rideStatusLabel =
    ride.status === 'cancelled'
      ? t('passengerTrips.rideStatus.cancelled')
      : ride.status === 'completed'
        ? t('passengerTrips.rideStatus.completed')
        : ride.status === 'in_progress'
          ? t('passengerTrips.rideStatus.in_progress')
          : t('passengerTrips.rideStatus.active');

  const driverActions: {
    key: string;
    label: string;
    icon: ReactNode;
    onPress: () => void;
    disabled?: boolean;
    sub?: string;
  }[] = [];
  if (isDriverViewer && actions) {
    if (actions.onStart && phase.phase === 'startable') {
      const startsAtText = formatStartWindowOpensAt(phase.startWindowStart);
      driverActions.push({
        key: 'start',
        label: t('agenda.actions.startRide.label'),
        icon: <Play color={Palette.primary} size={14} />,
        disabled: !phase.canStart,
        sub:
          !phase.canStart && startsAtText
            ? t('agenda.actions.startRide.notYet', { time: startsAtText })
            : undefined,
        onPress: () => actions.onStart?.(ride.id),
      });
    }
    if (actions.onScan && phase.canScan) {
      driverActions.push({
        key: 'scan',
        label: t('agenda.actions.scanBoarding.label'),
        icon: <ScanLine color={Palette.primary} size={14} />,
        onPress: () => actions.onScan?.(ride.id),
      });
    }
    if (actions.onComplete && phase.canComplete) {
      driverActions.push({
        key: 'complete',
        label: t('agenda.actions.completeRide.label'),
        icon: <CheckCircle2 color={Palette.primary} size={14} />,
        onPress: () => actions.onComplete?.(ride.id),
      });
    }
  }
  if (actions?.onReportIncident && phase.canReportIncident) {
    driverActions.push({
      key: 'incident',
      label: t('safety.incidents.action.report'),
      icon: <ShieldAlert color={Palette.danger} size={14} />,
      onPress: () => actions.onReportIncident?.(ride.id),
    });
  }
  return (
    <View style={[styles.rideContainer, highlighted && styles.rideRowHighlighted]}>
      <View style={styles.rideRowInner}>
        <View style={styles.rideRowLeft}>
          <Text style={styles.rideTime}>{normalizeRideTime(ride.scheduledDeparture)}</Text>
          <Text style={styles.rideDate}>{normalizeDate(ride.scheduledDeparture, lang)}</Text>
        </View>
        <View style={styles.rideRowMeta}>
          <View style={styles.rideMetaItem}>
            <Users color={Palette.textSecondary} size={13} />
            <Text style={styles.rideMetaText}>{`${seatsAvailable}/${ride.seatsOffered}`}</Text>
          </View>
          {ride.totalDistanceKm ? (
            <View style={styles.rideMetaItem}>
              <Gauge color={Palette.textSecondary} size={13} />
              <Text
                style={styles.rideMetaText}
              >{`${normalizeNumber(ride.totalDistanceKm)} km`}</Text>
            </View>
          ) : null}
          {ride.estimatedDurationMinutes ? (
            <View style={styles.rideMetaItem}>
              <Clock color={Palette.textSecondary} size={13} />
              <Text style={styles.rideMetaText}>
                {normalizeDuration(ride.estimatedDurationMinutes)}
              </Text>
            </View>
          ) : null}
          {ride.estimatedCo2SavingsPerSeatKg ? (
            <View style={styles.rideMetaItem}>
              <Leaf color={Palette.textSecondary} size={13} />
              <Text style={styles.rideMetaText}>
                {t('gamification.summary.kgValue', {
                  value: normalizeNumber(ride.estimatedCo2SavingsPerSeatKg),
                })}
              </Text>
            </View>
          ) : null}
        </View>
        <StatusBadge label={rideStatusLabel} variant={rideStatusVariant} />
      </View>
      {driverActions.length > 0 ? (
        <View style={styles.rideActionsRow}>
          {driverActions.map((action) => (
            <Pressable
              accessibilityRole="button"
              disabled={action.disabled}
              key={action.key}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.rideActionChip,
                action.disabled && styles.rideActionChipDisabled,
                pressed && !action.disabled && styles.rideActionChipPressed,
              ]}
            >
              {action.icon}
              <Text
                style={[
                  styles.rideActionChipText,
                  action.disabled && styles.rideActionChipTextDisabled,
                ]}
              >
                {action.label}
              </Text>
              {action.sub ? <Text style={styles.rideActionChipSub}>· {action.sub}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TripTypeChip({ type }: { type: 'sporadic' | 'recurring' }) {
  const { t } = useTranslation();
  const label =
    type === 'recurring' ? t('passengerTrips.type.recurring') : t('passengerTrips.type.oneTime');
  return (
    <View style={styles.typeChip}>
      <CalendarDays color={Palette.primaryDark} size={13} />
      <Text style={styles.typeChipText}>{label}</Text>
    </View>
  );
}

function EventTagRow({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/events/[id]', params: { id: eventId } })}
      style={({ pressed }) => [styles.eventTagRow, pressed && styles.eventTagRowPressed]}
    >
      <Ticket color={Palette.primaryDark} size={15} />
      <Text style={styles.eventTagText}>{t('trips.eventTag')}</Text>
      <ChevronRight color={Palette.primaryDark} size={14} />
    </Pressable>
  );
}

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

function WeekdayStrip({ days }: { days: NonNullable<DriverTripDto['schedule']>['daysOfWeek'] }) {
  const { t } = useTranslation();
  const flags: Record<WeekdayKey, boolean> = {
    mon: Boolean(days?.monday),
    tue: Boolean(days?.tuesday),
    wed: Boolean(days?.wednesday),
    thu: Boolean(days?.thursday),
    fri: Boolean(days?.friday),
    sat: Boolean(days?.saturday),
    sun: Boolean(days?.sunday),
  };
  return (
    <View style={styles.weekdayStrip}>
      {WEEKDAY_KEYS.map((key) => {
        const active = flags[key];
        return (
          <View
            key={key}
            style={[
              styles.weekdayDot,
              active ? styles.weekdayDotActive : styles.weekdayDotInactive,
            ]}
          >
            <Text
              style={[
                styles.weekdayDotText,
                active ? styles.weekdayDotTextActive : styles.weekdayDotTextInactive,
              ]}
            >
              {t(`passengerTrips.detail.daysOfWeek.${key}` as const)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function RolePill({ role }: { role: 'driver' | 'passenger' }) {
  const { t } = useTranslation();
  const isDriver = role === 'driver';
  const label = isDriver ? t('agenda.driver.role') : t('agenda.passenger.role');
  return (
    <View
      accessibilityLabel={label}
      accessible
      style={[styles.rolePill, isDriver ? styles.rolePillDriver : styles.rolePillPassenger]}
    >
      {isDriver ? (
        <Car color={Palette.primaryDark} size={13} />
      ) : (
        <User color={Palette.textSecondary} size={13} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  scroll: {
    flex: 1,
  },
  container: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.xxl,
  },
  section: {
    gap: Spacing.md,
  },
  tripCard: {
    borderRadius: Radii.lg,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    gap: Spacing.lg,
    ...Shadow.cardSoft,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  cardLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  prefRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  prefChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Palette.primarySurface,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  prefChipText: {
    gap: 2,
  },
  prefChipLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  prefChipValue: {
    color: Palette.primaryDark,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    textTransform: 'capitalize',
  },
  driverButton: {
    borderRadius: Radii.lg,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.cardSoft,
  },
  driverButtonPressed: {
    opacity: 0.82,
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.primarySurface,
  },
  driverAvatarText: {
    color: Palette.primaryDark,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
  },
  driverTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  driverName: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  driverSubtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  editHeaderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editHeaderButtonPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  ridesList: {
    gap: Spacing.sm,
  },
  rideContainer: {
    gap: Spacing.sm,
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.cardSoft,
  },
  rideRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rideRowHighlighted: {
    borderColor: Palette.primary,
    backgroundColor: Palette.primarySurface,
  },
  rideActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  rideActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.pill,
    backgroundColor: Palette.primarySurface,
    borderWidth: 1,
    borderColor: Palette.primary,
  },
  rideActionChipPressed: {
    opacity: 0.85,
  },
  rideActionChipDisabled: {
    backgroundColor: Palette.backgroundMuted,
    borderColor: Palette.border,
  },
  rideActionChipText: {
    color: Palette.primaryDark,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  rideActionChipTextDisabled: {
    color: Palette.textSecondary,
  },
  rideActionChipSub: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  rideRowLeft: {
    minWidth: 52,
    gap: 2,
  },
  rideTime: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  rideDate: {
    color: Palette.textSecondary,
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.medium,
  },
  rideRowMeta: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  rideMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  rideMetaText: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
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
  successCard: {
    backgroundColor: Palette.successSurface,
    borderColor: Palette.success,
  },
  infoText: {
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
  successText: {
    color: Palette.success,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  helperText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    fontStyle: 'italic',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  requestButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Palette.primarySurface,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    alignSelf: 'flex-start',
  },
  typeChipText: {
    color: Palette.primaryDark,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  eventTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.pill,
    backgroundColor: Palette.primarySurface,
    borderWidth: 1,
    borderColor: Palette.primary,
    alignSelf: 'flex-start',
  },
  eventTagRowPressed: {
    opacity: 0.8,
  },
  eventTagText: {
    color: Palette.primaryDark,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  rolePill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolePillDriver: {
    borderColor: Palette.primary,
    backgroundColor: Palette.primarySurface,
  },
  rolePillPassenger: {
    borderColor: Palette.border,
    backgroundColor: Palette.backgroundMuted,
  },
  weekdayStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  weekdayDot: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  weekdayDotActive: {
    backgroundColor: Palette.primary,
    borderColor: Palette.primary,
  },
  weekdayDotInactive: {
    backgroundColor: Palette.backgroundMuted,
    borderColor: Palette.border,
  },
  weekdayDotText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  weekdayDotTextActive: {
    color: Palette.textOnPrimary,
  },
  weekdayDotTextInactive: {
    color: Palette.textSecondary,
  },
});
