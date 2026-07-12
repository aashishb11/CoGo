import { Calendar, MapPin, Repeat } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type BookingStatus, type InboxBooking, type InboxItem } from '@/features/inbox/api';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { StatusBadge } from '@/shared/ui/components/status-badge';

type InboxRequestCardProps = {
  item: InboxItem;
  onViewDetails: (item: InboxItem) => void;
};

const LOCALE_MAP: Record<Lang, string> = {
  en: 'en-US',
  es: 'es-ES',
  ca: 'ca-ES',
};

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || '??';
}

function formatDateTime(value: string, lang: Lang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(LOCALE_MAP[lang], {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return value;
  }
}

function readBookingMessage(bookings: InboxBooking[]) {
  for (const booking of bookings) {
    if (typeof booking.message === 'string' && booking.message.trim()) {
      return booking.message.trim();
    }
  }
  return '';
}

function statusColor(status: BookingStatus) {
  if (status === 'accepted') {
    return {
      bg: Palette.successSurface,
      fg: Palette.success,
    };
  }

  if (status === 'pending') {
    return {
      bg: Palette.backgroundMuted,
      fg: Palette.textSecondary,
    };
  }

  return {
    bg: Palette.dangerSurface,
    fg: Palette.danger,
  };
}

export function InboxRequestCard({ item, onViewDetails }: InboxRequestCardProps) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;

  const initials = getInitials(item.passenger.name);
  const message = readBookingMessage(item.bookings);
  const visibleBookings = item.bookings.slice(0, 3);
  const hiddenBookingsCount = Math.max(0, item.bookings.length - visibleBookings.length);
  const hasPending = item.pendingCount > 0;
  const TripTypeIcon = item.trip.type === 'recurring' ? Repeat : Calendar;

  return (
    <View style={[styles.card, hasPending ? styles.pendingCard : styles.acceptedCard]}>
      <View style={styles.headerRow}>
        <View style={styles.passengerRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.passengerTextWrap}>
            <Text numberOfLines={1} style={styles.passengerName}>
              {item.passenger.name}
            </Text>
            <Text style={styles.passengerMeta}>
              {hasPending
                ? t('inbox.requests.pendingSummary', { count: item.pendingCount })
                : t('inbox.requests.acceptedSummary', { count: item.acceptedCount })}
            </Text>
          </View>
        </View>

        <StatusBadge
          label={
            hasPending ? t('inbox.requests.status.pending') : t('inbox.requests.status.accepted')
          }
          variant={hasPending ? 'pending' : 'accepted'}
        />
      </View>

      <View style={styles.routeRow}>
        <MapPin color={Palette.primary} size={16} strokeWidth={2.3} />
        <Text numberOfLines={1} style={styles.routeText}>
          {item.trip.originLabel}
          {' -> '}
          {item.trip.destinationLabel}
        </Text>
      </View>

      <View style={styles.tripTypeRow}>
        <TripTypeIcon color={Palette.textSecondary} size={14} strokeWidth={2.2} />
        <Text style={styles.tripTypeText}>
          {item.trip.type === 'recurring'
            ? t('inbox.requests.tripType.recurring')
            : t('inbox.requests.tripType.sporadic')}
        </Text>
      </View>

      <View style={styles.bookingChipsRow}>
        {visibleBookings.map((booking) => {
          const colors = statusColor(booking.status);
          return (
            <View key={booking.id} style={[styles.bookingChip, { backgroundColor: colors.bg }]}>
              <Text style={[styles.bookingChipText, { color: colors.fg }]}>
                {formatDateTime(booking.scheduledDeparture, lang)}
              </Text>
            </View>
          );
        })}
        {hiddenBookingsCount > 0 ? (
          <View style={styles.moreChip}>
            <Text style={styles.moreChipText}>+{hiddenBookingsCount}</Text>
          </View>
        ) : null}
      </View>

      {message ? (
        <View style={styles.messageBox}>
          <Text numberOfLines={3} style={styles.messageText}>
            {message}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => onViewDetails(item)}
        style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}
      >
        <Text style={styles.detailsButtonText}>{t('inbox.requests.viewDetails')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderLeftWidth: 4,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.cardSoft,
  },
  pendingCard: {
    borderColor: Palette.border,
    borderLeftColor: Palette.warning,
  },
  acceptedCard: {
    borderColor: Palette.border,
    borderLeftColor: Palette.primary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  passengerRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Palette.primaryDark,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  passengerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  passengerName: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  passengerMeta: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  routeText: {
    flex: 1,
    minWidth: 0,
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  tripTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tripTypeText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  bookingChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  bookingChip: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  bookingChipText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  moreChip: {
    borderRadius: Radii.pill,
    backgroundColor: Palette.backgroundMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  moreChipText: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  messageBox: {
    borderRadius: Radii.md,
    backgroundColor: Palette.backgroundMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  messageText: {
    color: Palette.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    lineHeight: 18,
  },
  detailsButton: {
    minHeight: 36,
    borderRadius: Radii.md,
    backgroundColor: Palette.primarySurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  detailsButtonText: {
    color: Palette.primaryDark,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  pressed: {
    opacity: 0.86,
  },
});
