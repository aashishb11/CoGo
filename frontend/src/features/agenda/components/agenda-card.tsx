import {
  Car,
  CheckCircle2,
  Clock,
  Leaf,
  Navigation,
  Play,
  QrCode,
  ScanLine,
  ShieldAlert,
  Star,
  Trash2,
  User,
  X as XIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatTimeHHmm } from '@/features/agenda/utils/dates';
import type { AgendaItem } from '@/features/trips/api';
import { derivePhase, formatStartWindowOpensAt } from '@/features/trips/ride-phase';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ActionMenu, type ActionMenuItem } from '@/shared/ui/components/action-menu';
import { RouteTimeline } from '@/shared/ui/components/route-timeline';
import { StatusBadge, type StatusVariant } from '@/shared/ui/components/status-badge';
import { TripTypePill } from '@/shared/ui/components/trip-type-pill';

type AgendaCardProps = {
  item: AgendaItem;
  isFavorite?: boolean;
  isFavoritePending?: boolean;
  onPress: (item: AgendaItem) => void;
  onDriverPress?: (driverId: string) => void;
  onToggleFavorite?: (tripId: string, isFavorite: boolean) => void;
  onCancelTrip?: (tripId: string) => void;
  onCancelRide?: (rideId: string) => void;
  onCompleteRide?: (rideId: string) => void;
  onStartRide?: (rideId: string) => void;
  onScanBoarding?: (rideId: string) => void;
  onShowBoardingPass?: (bookingId: string) => void;
  onCancelMyRide?: (bookingId: string) => void;
  onReportIncident?: (rideId: string) => void;
};

type DriverStatus = 'open' | 'partial' | 'full' | 'pending';
type PassengerStatus = 'pending' | 'confirmed';

function resolveDriverStatus(item: Extract<AgendaItem, { role: 'driver' }>): DriverStatus {
  if (item.pendingBookingCount > 0) return 'pending';
  if (item.seatsOccupied >= item.seatsOffered) return 'full';
  if (item.seatsOccupied > 0) return 'partial';
  return 'open';
}

function resolvePassengerStatus(item: Extract<AgendaItem, { role: 'passenger' }>): PassengerStatus {
  return item.myBookingStatus === 'accepted' ? 'confirmed' : 'pending';
}

// Pending overrides role with amber so "you have something to action" reads at
// a glance regardless of who's driving. Otherwise: driver = brand green,
// passenger = neutral border.
function getAccent(item: AgendaItem): string {
  if (item.role === 'driver') {
    return resolveDriverStatus(item) === 'pending' ? Palette.warning : Palette.primary;
  }
  return resolvePassengerStatus(item) === 'pending' ? Palette.warning : Palette.border;
}

function formatNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return '';
  return fractionDigits === 0 ? String(Math.round(value)) : value.toFixed(fractionDigits);
}

export function AgendaCard({
  item,
  isFavorite = false,
  isFavoritePending = false,
  onPress,
  onDriverPress,
  onToggleFavorite,
  onCancelTrip,
  onCancelRide,
  onCompleteRide,
  onStartRide,
  onScanBoarding,
  onShowBoardingPass,
  onCancelMyRide,
  onReportIncident,
}: AgendaCardProps) {
  const { t } = useTranslation();
  const recurring = item.tripType === 'recurring';
  const time = formatTimeHHmm(item.scheduledDeparture);
  const accent = getAccent(item);
  const tripTypeLabel = recurring ? t('agenda.type.recurring') : t('agenda.type.oneTime');

  // Single source of truth for what actions the ride is in shape for right
  // now. Falls back to a time-based heuristic when the backend doesn't ship
  // `status` on agenda items — the API itself still gates each call, so a
  // stale UI decision only ever produces an explanatory toast.
  const phaseInfo = derivePhase({
    status: item.status,
    scheduledDeparture: item.scheduledDeparture,
  });

  const menuActions: ActionMenuItem[] = [];
  if (item.role === 'driver') {
    if (onStartRide && phaseInfo.phase === 'startable') {
      const startsAtText = formatStartWindowOpensAt(phaseInfo.startWindowStart);
      const isOutsideWindow = !phaseInfo.canStart;
      menuActions.push({
        label: t('agenda.actions.startRide.label'),
        description: isOutsideWindow
          ? t('agenda.actions.startRide.notYet', { time: startsAtText })
          : t('agenda.actions.startRide.description'),
        icon: <Play color={Palette.primary} size={16} />,
        disabled: isOutsideWindow,
        onPress: () => onStartRide(item.rideId),
      });
    }
    if (onScanBoarding && phaseInfo.canScan) {
      menuActions.push({
        label: t('agenda.actions.scanBoarding.label'),
        description: t('agenda.actions.scanBoarding.description'),
        icon: <ScanLine color={Palette.primary} size={16} />,
        onPress: () => onScanBoarding(item.rideId),
      });
    }
    if (onCompleteRide && phaseInfo.canComplete) {
      menuActions.push({
        label: t('agenda.actions.completeRide.label'),
        description: t('agenda.actions.completeRide.description'),
        icon: <CheckCircle2 color={Palette.primary} size={16} />,
        onPress: () => onCompleteRide(item.rideId),
      });
    }
    if (recurring && onCancelRide && phaseInfo.canCancel) {
      menuActions.push({
        label: t('agenda.actions.cancelRide.label'),
        description: t('agenda.actions.cancelRide.description'),
        icon: <XIcon color={Palette.danger} size={16} />,
        danger: true,
        onPress: () => onCancelRide(item.rideId),
      });
    }
    if (onCancelTrip && phaseInfo.canCancel) {
      menuActions.push({
        label: t('agenda.actions.cancelTrip.label'),
        description: t('agenda.actions.cancelTrip.description'),
        icon: <Trash2 color={Palette.danger} size={16} />,
        danger: true,
        onPress: () => onCancelTrip(item.tripId),
      });
    }
    if (onReportIncident && phaseInfo.canReportIncident) {
      menuActions.push({
        label: t('safety.incidents.action.report'),
        description: t('agenda.actions.reportIncident.description'),
        icon: <ShieldAlert color={Palette.danger} size={16} />,
        danger: true,
        onPress: () => onReportIncident(item.rideId),
      });
    }
  } else {
    if (onShowBoardingPass && phaseInfo.canShowBoardingPass) {
      menuActions.push({
        label: t('agenda.actions.showBoardingPass.label'),
        description: t('agenda.actions.showBoardingPass.description'),
        icon: <QrCode color={Palette.primary} size={16} />,
        onPress: () => onShowBoardingPass(item.myBookingId),
      });
    }
    if (onToggleFavorite) {
      menuActions.push({
        label: isFavorite
          ? t('agenda.actions.unfavorite.label')
          : t('agenda.actions.favorite.label'),
        description: isFavorite
          ? t('agenda.actions.unfavorite.description')
          : t('agenda.actions.favorite.description'),
        icon: (
          <Star
            color={isFavorite ? Palette.warning : Palette.textSecondary}
            fill={isFavorite ? Palette.warning : 'transparent'}
            size={16}
          />
        ),
        disabled: isFavoritePending,
        onPress: () => onToggleFavorite(item.tripId, isFavorite),
      });
    }
    if (onCancelMyRide && phaseInfo.canCancelMyBooking) {
      menuActions.push({
        label: t('agenda.actions.cancelMyRide.label'),
        description: t('agenda.actions.cancelMyRide.description'),
        icon: <XIcon color={Palette.danger} size={16} />,
        danger: true,
        onPress: () => onCancelMyRide(item.myBookingId),
      });
    }
    // Passenger can only submit if the BE accepted their boarding scan. We
    // don't have `boardedAt` on the agenda payload, so we use accepted +
    // canReportIncident as a best-effort gate; the BE returns 403 with a
    // clear toast if they never actually boarded.
    if (onReportIncident && phaseInfo.canReportIncident && item.myBookingStatus === 'accepted') {
      menuActions.push({
        label: t('safety.incidents.action.report'),
        description: t('agenda.actions.reportIncident.description'),
        icon: <ShieldAlert color={Palette.danger} size={16} />,
        danger: true,
        onPress: () => onReportIncident(item.rideId),
      });
    }
  }

  const distanceKm = Number.isFinite(item.totalDistanceKm) ? item.totalDistanceKm : null;
  const durationMin =
    typeof item.estimatedDurationMinutes === 'number' &&
    Number.isFinite(item.estimatedDurationMinutes)
      ? item.estimatedDurationMinutes
      : null;
  const co2Kg =
    typeof item.estimatedCo2SavingsPerSeatKg === 'number' &&
    Number.isFinite(item.estimatedCo2SavingsPerSeatKg)
      ? item.estimatedCo2SavingsPerSeatKg
      : null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: accent },
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.timeText}>{time}</Text>
        <View style={styles.headerRight}>
          {item.status === 'in_progress' ? (
            <StatusBadge label={t('agenda.inProgress.titleOne')} variant="in_progress" />
          ) : item.status === 'completed' ? (
            <StatusBadge label={t('agenda.completed.titleOne')} variant="archived" />
          ) : null}
          <RolePill role={item.role} />
          {item.role === 'driver' ? (
            <DriverStatusPill item={item} />
          ) : (
            <PassengerStatusPill item={item} />
          )}
          {menuActions.length > 0 ? (
            <ActionMenu accessibilityLabel={t('agenda.actions.menuLabel')} actions={menuActions} />
          ) : null}
        </View>
      </View>

      <View style={styles.routeWrap}>
        <RouteTimeline
          destination={item.destination.label}
          dropoffLabel={t('agenda.dropoff')}
          origin={item.origin.label}
          pickupLabel={t('agenda.pickup')}
        />
      </View>

      {item.role === 'driver' && onStartRide && phaseInfo.canStart ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onStartRide(item.rideId)}
          style={({ pressed }) => [styles.startCta, pressed && styles.startCtaPressed]}
        >
          <Play color={Palette.textOnPrimary} size={16} strokeWidth={2.4} />
          <Text style={styles.startCtaText}>{t('agenda.actions.startRide.label')}</Text>
        </Pressable>
      ) : null}

      {item.role === 'passenger' ? (
        <View style={styles.participantSection}>
          <PassengerBody item={item} onDriverPress={onDriverPress} />
        </View>
      ) : null}

      <View style={styles.tertiaryRow}>
        <TripTypePill label={tripTypeLabel} type={recurring ? 'recurring' : 'sporadic'} />
        {distanceKm !== null ? (
          <>
            <Text style={styles.tertiaryDot}>·</Text>
            <View style={styles.tertiaryItem}>
              <Navigation color={Palette.textSecondary} size={11} />
              <Text style={styles.tertiaryText}>
                {t('agenda.metrics.km', { value: formatNumber(distanceKm, 1) })}
              </Text>
            </View>
          </>
        ) : null}
        {durationMin !== null ? (
          <>
            <Text style={styles.tertiaryDot}>·</Text>
            <View style={styles.tertiaryItem}>
              <Clock color={Palette.textSecondary} size={11} />
              <Text style={styles.tertiaryText}>
                {t('agenda.metrics.min', { value: formatNumber(durationMin) })}
              </Text>
            </View>
          </>
        ) : null}
        {co2Kg !== null ? (
          <>
            <Text style={styles.tertiaryDot}>·</Text>
            <View style={styles.tertiaryItem}>
              <Leaf color={Palette.primary} size={11} />
              <Text style={[styles.tertiaryText, styles.co2Text]}>
                {t('agenda.metrics.co2', { value: formatNumber(co2Kg, 1) })}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

function RolePill({ role }: { role: AgendaItem['role'] }) {
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

function DriverStatusPill({ item }: { item: Extract<AgendaItem, { role: 'driver' }> }) {
  const { t } = useTranslation();
  const status = resolveDriverStatus(item);

  if (status === 'pending') {
    return (
      <StatusBadge
        label={t('agenda.driver.pending', { count: item.pendingBookingCount })}
        variant="pending"
      />
    );
  }
  if (status === 'full') {
    return <StatusBadge label={t('agenda.driver.full')} variant="full" />;
  }
  // open + partial: surface the seat count so the driver sees fullness at a glance
  return (
    <StatusBadge
      label={t('agenda.driver.seatsShort', {
        occupied: String(item.seatsOccupied),
        offered: String(item.seatsOffered),
      })}
      variant="active"
    />
  );
}

function PassengerStatusPill({ item }: { item: Extract<AgendaItem, { role: 'passenger' }> }) {
  const { t } = useTranslation();
  const status = resolvePassengerStatus(item);
  const variant: StatusVariant = status;
  const label = status === 'confirmed' ? t('agenda.status.confirmed') : t('agenda.status.pending');
  return <StatusBadge label={label} variant={variant} />;
}

function PassengerBody({
  item,
  onDriverPress,
}: {
  item: Extract<AgendaItem, { role: 'passenger' }>;
  onDriverPress?: (driverId: string) => void;
}) {
  const { t } = useTranslation();
  const initial = item.driver.name.charAt(0).toUpperCase() || '?';
  const car = item.car;
  const carPrimary = car ? `${car.brand} ${car.name ?? car.model ?? ''}`.trim() : null;
  const colorRaw = typeof car?.color === 'string' ? car.color.trim() : '';
  const carSecondary = car
    ? colorRaw
      ? t('agenda.passenger.carPlate', { color: colorRaw, plate: car.plate })
      : t('agenda.passenger.carPlateNoColor', { plate: car.plate })
    : null;

  return (
    <View style={styles.profileList}>
      <Pressable
        accessibilityLabel={t('passengerTrips.driver.openProfile', { name: item.driver.name })}
        accessibilityRole="button"
        onPress={onDriverPress ? () => onDriverPress(item.driver.id) : undefined}
        style={({ pressed }) => [styles.profileRow, pressed && onDriverPress && styles.rowPressed]}
      >
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>{initial}</Text>
        </View>
        <View style={styles.profileTextWrap}>
          <Text numberOfLines={1} style={styles.profilePrimary}>
            {item.driver.name}
          </Text>
          <Text style={styles.profileSecondary}>{t('agenda.passenger.driverRole')}</Text>
        </View>
      </Pressable>
      {car && carPrimary ? (
        <View style={styles.profileRow}>
          <View style={[styles.profileAvatar, styles.profileAvatarCar]}>
            <Car color={Palette.primaryDark} size={20} />
          </View>
          <View style={styles.profileTextWrap}>
            <Text numberOfLines={1} style={styles.profilePrimary}>
              {carPrimary}
            </Text>
            {carSecondary ? (
              <Text numberOfLines={1} style={styles.profileSecondary}>
                {carSecondary}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    borderLeftWidth: 4,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    ...Shadow.cardSoft,
  },
  cardPressed: {
    opacity: 0.85,
  },
  rowPressed: {
    opacity: 0.72,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
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
  timeText: {
    color: Palette.text,
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.bold,
    lineHeight: FontSize['3xl'] + 4,
  },
  startCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.primary,
    borderRadius: Radii.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  startCtaPressed: {
    opacity: 0.88,
  },
  startCtaText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  routeWrap: {
    marginBottom: Spacing.xl,
  },
  participantSection: {
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  profileList: {
    gap: Spacing.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarCar: {
    backgroundColor: Palette.primarySurface,
  },
  profileAvatarText: {
    color: Palette.primaryDark,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  profileTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  profilePrimary: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  profileSecondary: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  tertiaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
    flexWrap: 'wrap',
    rowGap: Spacing.xs,
  },
  tertiaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tertiaryText: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  tertiaryDot: {
    color: Palette.border,
    fontSize: FontSize.xs,
  },
  co2Text: {
    color: Palette.primary,
    fontWeight: FontWeight.semibold,
  },
});
