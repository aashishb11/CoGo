import { useRouter } from 'expo-router';
import { Star, Ticket, UserPlus, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type DriverTripDto } from '@/features/trips/api';
import {
  formatOneTimeDate,
  isRecurringTrip,
  normalizePointLabel,
  normalizeSeats,
  normalizeTripTime,
} from '@/features/trips/utils/trip-display';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';
import { ActionMenu, type ActionMenuItem } from '@/shared/ui/components/action-menu';
import { ParticipantRow } from '@/shared/ui/components/participant-row';
import { RouteTimeline } from '@/shared/ui/components/route-timeline';
import { getStatusAccent, StatusBadge } from '@/shared/ui/components/status-badge';
import { TripTypePill } from '@/shared/ui/components/trip-type-pill';

type PassengerTripCardProps = {
  trip: DriverTripDto;
  detailRideId?: string | null;
  isFavorite?: boolean;
  isFavoritePending?: boolean;
  onPress?: (tripId: string, rideId?: string | null) => void;
  onDriverPress?: (driverId: string) => void;
  onToggleFavorite?: (tripId: string, isFavorite: boolean) => void;
  onRequestJoin?: (tripId: string) => void;
};

type CardStatus = 'active' | 'cancelled' | 'archived';

function resolveStatus(status: unknown): CardStatus {
  return status === 'cancelled' || status === 'archived' ? status : 'active';
}

export function PassengerTripCard({
  trip,
  detailRideId = null,
  isFavorite = false,
  isFavoritePending = false,
  onPress,
  onDriverPress,
  onToggleFavorite,
  onRequestJoin,
}: PassengerTripCardProps) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;

  const origin = normalizePointLabel(trip.origin);
  const destination = normalizePointLabel(trip.destination);
  const time = normalizeTripTime(trip);
  const seats = normalizeSeats(trip);
  const status = resolveStatus(trip.status);
  const recurring = isRecurringTrip(trip);
  // Search results always represent a specific ride on a specific date, so we
  // show that date regardless of whether the underlying trip is recurring.
  // The "Recurring" pill below the route already signals the trip cadence.
  const dateLabel = formatOneTimeDate(trip, lang);
  const tripTypeLabel = recurring
    ? t('passengerTrips.type.recurring')
    : t('passengerTrips.type.oneTime');

  const menuActions: ActionMenuItem[] = onToggleFavorite
    ? [
        {
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
          onPress: () => onToggleFavorite(trip.id, isFavorite),
        },
      ]
    : [];

  const driverName =
    typeof trip.driver?.fullName === 'string' && trip.driver.fullName.trim().length > 0
      ? trip.driver.fullName.trim()
      : null;
  const driverId = trip.driver?.userId;
  const router = useRouter();
  const eventId =
    trip.externalEventContext?.provider === 'cultucat' ? trip.externalEventContext.eventId : null;

  return (
    <View style={[styles.card, { borderLeftColor: getStatusAccent(status) }]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress ? () => onPress(trip.id, detailRideId) : undefined}
        style={({ pressed }) => [pressed && onPress ? styles.cardPressed : null]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {dateLabel ? <Text style={styles.eyebrow}>{dateLabel}</Text> : null}
            <Text style={styles.timeText}>{time}</Text>
          </View>
          <View style={styles.headerRight}>
            <StatusBadge label={t(`passengerTrips.status.${status}` as const)} variant={status} />
            {menuActions.length > 0 ? (
              <ActionMenu
                accessibilityLabel={t('agenda.actions.menuLabel')}
                actions={menuActions}
              />
            ) : null}
          </View>
        </View>

        <View style={styles.routeWrap}>
          <RouteTimeline
            destination={destination}
            dropoffLabel={t('passengerTrips.dropoff')}
            origin={origin}
            pickupLabel={t('passengerTrips.pickup')}
          />
        </View>

        {driverName ? (
          <View style={styles.driverSection}>
            <ParticipantRow
              accessibilityLabel={t('passengerTrips.driver.openProfile', { name: driverName })}
              name={driverName}
              onPress={
                onDriverPress && driverId ? () => onDriverPress(driverId as string) : undefined
              }
              subtitle={t('passengerTrips.role.driver')}
            />
          </View>
        ) : null}

        <View style={styles.tertiaryRow}>
          <TripTypePill label={tripTypeLabel} type={recurring ? 'recurring' : 'sporadic'} />
          {seats !== null ? (
            <>
              <Text style={styles.tertiaryDot}>·</Text>
              <View style={styles.tertiaryItem}>
                <Users color={Palette.textSecondary} size={11} />
                <Text style={styles.tertiaryText}>{seats}</Text>
              </View>
            </>
          ) : null}
          {eventId ? (
            <>
              <Text style={styles.tertiaryDot}>·</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/events/[id]', params: { id: eventId } })}
                style={({ pressed }) => [styles.eventPill, pressed && styles.eventPillPressed]}
              >
                <Ticket color={Palette.primaryDark} size={11} />
                <Text style={styles.eventPillText}>{t('trips.eventTag')}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </Pressable>

      {onRequestJoin ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onRequestJoin(trip.id)}
          style={({ pressed }) => [styles.requestButton, pressed && styles.requestButtonPressed]}
        >
          <UserPlus color={Palette.textOnPrimary} size={17} strokeWidth={2.4} />
          <Text style={styles.requestButtonText}>{t('joinTrip.requestButton')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.border,
    borderLeftWidth: 4,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
  },
  cardPressed: {
    opacity: 0.85,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  eyebrow: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  timeText: {
    color: Palette.text,
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.bold,
    lineHeight: 24,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.sm - 2,
  },
  statusPillText: {
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  routeWrap: {
    marginBottom: Spacing.xl,
  },
  driverSection: {
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  tertiaryRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
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
  requestButton: {
    marginTop: Spacing.lg,
    minHeight: 44,
    borderRadius: Radii.md,
    backgroundColor: Palette.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  requestButtonPressed: {
    opacity: 0.88,
  },
  requestButtonText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  eventPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.sm,
    backgroundColor: Palette.primarySurface,
    borderWidth: 1,
    borderColor: Palette.primary,
  },
  eventPillPressed: {
    opacity: 0.8,
  },
  eventPillText: {
    color: Palette.primaryDark,
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.4,
  },
});
