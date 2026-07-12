import { Calendar, Clock, Pencil, Repeat, Trash2, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { type DriverTripDto } from '@/features/trips/api';
import {
  formatOneTimeDate,
  isRecurringTrip,
  normalizePointLabel,
  normalizeSeats,
  normalizeTripTime,
  recurringWeekdayDots,
} from '@/features/trips/utils/trip-display';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ActionMenu } from '@/shared/ui/components/action-menu';
import { RouteTimeline } from '@/shared/ui/components/route-timeline';
import { StatusBadge, type StatusVariant } from '@/shared/ui/components/status-badge';

type MyTripCardProps = {
  trip: DriverTripDto;
  onPress?: (tripId: string) => void;
  onCancel?: (tripId: string) => void;
  onEdit?: (tripId: string) => void;
  isCancelling?: boolean;
};

const STATUS_LABEL_KEY = {
  active: 'active',
  cancelled: 'cancelled',
  archived: 'archived',
} as const;

const STATUS_ACCENT: Record<keyof typeof STATUS_LABEL_KEY, string> = {
  active: Palette.primary,
  cancelled: Palette.danger,
  archived: Palette.border,
};

function resolveStatus(status: unknown): keyof typeof STATUS_LABEL_KEY {
  return status === 'cancelled' || status === 'archived' ? status : 'active';
}

export function MyTripCard({
  trip,
  onPress,
  onCancel,
  onEdit,
  isCancelling = false,
}: MyTripCardProps) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;

  const origin = normalizePointLabel(trip.origin);
  const destination = normalizePointLabel(trip.destination);
  const time = normalizeTripTime(trip);
  const seats = normalizeSeats(trip);
  const status = resolveStatus(trip.status);
  const recurring = isRecurringTrip(trip);
  const dateLabel = recurring ? recurringWeekdayDots(trip, lang) : formatOneTimeDate(trip, lang);
  const tripTypeLabel = recurring
    ? t('passengerTrips.type.recurring')
    : t('passengerTrips.type.oneTime');
  const TripTypeIcon = recurring ? Repeat : Calendar;
  const canEditOrCancel = status === 'active';
  const showActionMenu = canEditOrCancel && (Boolean(onEdit) || Boolean(onCancel));
  const statusVariant: StatusVariant = status;

  const menuActions = [
    onEdit
      ? {
          label: t('myTrips.actions.edit.label'),
          description: t('myTrips.actions.edit.description'),
          icon: <Pencil color={Palette.textSecondary} size={16} />,
          onPress: () => onEdit(trip.id),
        }
      : null,
    onCancel
      ? {
          label: t('myTrips.actions.cancelTrip.label'),
          description: t('myTrips.actions.cancelTrip.description'),
          icon: <Trash2 color={Palette.danger} size={16} />,
          danger: true,
          onPress: () => onCancel(trip.id),
        }
      : null,
  ].filter(Boolean) as {
    label: string;
    description?: string;
    icon: React.ReactNode;
    danger?: boolean;
    onPress: () => void;
  }[];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress ? () => onPress(trip.id) : undefined}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: STATUS_ACCENT[status] },
        pressed && onPress ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {dateLabel ? <Text style={styles.eyebrow}>{dateLabel}</Text> : null}
          <View style={styles.timeBlock}>
            <Clock color={Palette.textSecondary} size={14} />
            <Text style={styles.timeText}>{time}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <StatusBadge
            label={t(`passengerTrips.status.${STATUS_LABEL_KEY[status]}` as const)}
            variant={statusVariant}
          />
          {showActionMenu ? (
            isCancelling ? (
              <ActivityIndicator color={Palette.danger} size="small" />
            ) : (
              <ActionMenu
                accessibilityLabel={t('myTrips.actions.menuLabel')}
                actions={menuActions}
              />
            )
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

      <View style={styles.footerRow}>
        <View style={styles.tertiaryRow}>
          <View style={styles.tertiaryItem}>
            <TripTypeIcon color={Palette.textSecondary} size={11} />
            <Text style={styles.tertiaryText}>{tripTypeLabel}</Text>
          </View>
          {seats !== null ? (
            <>
              <Text style={styles.tertiaryDot}>·</Text>
              <View style={styles.tertiaryItem}>
                <Users color={Palette.textSecondary} size={11} />
                <Text style={styles.tertiaryText}>{seats}</Text>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
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
    paddingVertical: Spacing.xl,
    ...Shadow.cardSoft,
  },
  cardPressed: {
    opacity: 0.85,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
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
  timeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
  },
  timeText: {
    color: Palette.text,
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.bold,
    lineHeight: 24,
  },
  routeWrap: {
    marginBottom: Spacing.lg,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  tertiaryRow: {
    flex: 1,
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
});
