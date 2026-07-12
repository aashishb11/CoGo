import { Calendar, CheckCircle, Clock, XCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { type BookingResponse, type BookingStatus } from '@/features/bookings/api';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type SentBookingCardProps = {
  group: SentBookingGroup;
  dismissedAcceptedBookingIds: ReadonlySet<string>;
  isDismissingAccepted?: boolean;
  onDismissAccepted: (group: SentBookingGroup) => void;
};

export type SentBookingGroup = {
  tripId: string;
  bookings: BookingResponse[];
};

const LOCALE_MAP: Record<Lang, string> = {
  en: 'en-US',
  es: 'es-ES',
  ca: 'ca-ES',
};

function formatDateTime(value: string, lang: Lang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(LOCALE_MAP[lang], {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return value;
  }
}

function readMessage(message: unknown) {
  return typeof message === 'string' ? message.trim() : '';
}

function countByStatus(bookings: BookingResponse[], status: BookingStatus) {
  return bookings.filter((booking) => booking.status === status).length;
}

function firstMessage(bookings: BookingResponse[]) {
  for (const booking of bookings) {
    const message = readMessage(booking.message);
    if (message) return message;
  }
  return '';
}

function groupPresentation(bookings: BookingResponse[]) {
  const pendingCount = countByStatus(bookings, 'pending');
  const acceptedCount = countByStatus(bookings, 'accepted');
  const rejectedCount = countByStatus(bookings, 'rejected');
  const cancelledCount = countByStatus(bookings, 'cancelled');
  const expiredCount = countByStatus(bookings, 'expired');
  const negativeCount = rejectedCount + cancelledCount + expiredCount;

  if (pendingCount > 0) {
    return {
      cardStyle: styles.pendingCard,
      Icon: Clock,
      iconColor: Palette.textSecondary,
      pillStyle: styles.pendingPill,
      textStyle: styles.pendingText,
      key: 'pending',
      pendingCount,
      acceptedCount,
      rejectedCount,
      cancelledCount,
      expiredCount,
    } as const;
  }

  if (acceptedCount > 0 && negativeCount === 0) {
    return {
      cardStyle: styles.acceptedCard,
      Icon: CheckCircle,
      iconColor: Palette.success,
      pillStyle: styles.acceptedPill,
      textStyle: styles.acceptedText,
      key: 'accepted',
      pendingCount,
      acceptedCount,
      rejectedCount,
      cancelledCount,
      expiredCount,
    } as const;
  }

  if (negativeCount > 0 && acceptedCount === 0) {
    return {
      cardStyle: styles.rejectedCard,
      Icon: XCircle,
      iconColor: Palette.danger,
      pillStyle: styles.rejectedPill,
      textStyle: styles.rejectedText,
      key: 'rejected',
      pendingCount,
      acceptedCount,
      rejectedCount,
      cancelledCount,
      expiredCount,
    } as const;
  }

  return {
    cardStyle: styles.acceptedCard,
    Icon: CheckCircle,
    iconColor: Palette.success,
    pillStyle: styles.acceptedPill,
    textStyle: styles.acceptedText,
    key: 'accepted',
    pendingCount,
    acceptedCount,
    rejectedCount,
    cancelledCount,
    expiredCount,
  } as const;
}

function statusChipPresentation(status: BookingStatus) {
  if (status === 'accepted') {
    return {
      Icon: CheckCircle,
      iconColor: Palette.success,
      pillStyle: styles.acceptedPill,
      textStyle: styles.acceptedText,
      key: 'accepted',
    } as const;
  }

  if (status === 'rejected') {
    return {
      Icon: XCircle,
      iconColor: Palette.danger,
      pillStyle: styles.rejectedPill,
      textStyle: styles.rejectedText,
      key: 'rejected',
    } as const;
  }

  if (status === 'pending') {
    return {
      Icon: Clock,
      iconColor: Palette.textSecondary,
      pillStyle: styles.pendingPill,
      textStyle: styles.pendingText,
      key: 'pending',
    } as const;
  }

  return {
    Icon: XCircle,
    iconColor: Palette.danger,
    pillStyle: styles.rejectedPill,
    textStyle: styles.rejectedText,
    key: status,
  } as const;
}

export function SentBookingCard({
  group,
  dismissedAcceptedBookingIds,
  isDismissingAccepted = false,
  onDismissAccepted,
}: SentBookingCardProps) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;
  const sortedBookings = [...group.bookings].sort(
    (left, right) =>
      new Date(left.scheduledDeparture).getTime() - new Date(right.scheduledDeparture).getTime(),
  );
  const message = firstMessage(sortedBookings);
  const status = groupPresentation(sortedBookings);
  const StatusIcon = status.Icon;
  const statusCounts = [
    { status: 'pending' as const, count: status.pendingCount },
    { status: 'accepted' as const, count: status.acceptedCount },
    { status: 'rejected' as const, count: status.rejectedCount },
    { status: 'cancelled' as const, count: status.cancelledCount },
    { status: 'expired' as const, count: status.expiredCount },
  ].filter((item) => item.count > 0);
  const acceptedBookingIds = sortedBookings
    .filter((booking) => booking.status === 'accepted')
    .map((booking) => booking.id);
  const hasAcceptedBookings = acceptedBookingIds.length > 0;
  const isAcceptedNotificationDismissed =
    hasAcceptedBookings &&
    acceptedBookingIds.every((bookingId) => dismissedAcceptedBookingIds.has(bookingId));
  const shouldShowAcceptedNotification = hasAcceptedBookings && !isAcceptedNotificationDismissed;

  return (
    <View style={[styles.card, status.cardStyle]}>
      <View style={styles.headerRow}>
        <View style={styles.dateRow}>
          <Calendar color={Palette.primary} size={18} strokeWidth={2.3} />
          <View style={styles.dateTextWrap}>
            <Text style={styles.label}>{t('inbox.sent.tripRequest')}</Text>
            <Text style={styles.dateText}>
              {t('inbox.sent.ridesRequested', { count: sortedBookings.length })}
            </Text>
          </View>
        </View>

        <View style={[styles.statusPill, status.pillStyle]}>
          <StatusIcon color={status.iconColor} size={12} strokeWidth={2.4} />
          <Text style={[styles.statusText, status.textStyle]}>
            {t(`inbox.requests.status.${status.key}` as const)}
          </Text>
        </View>
      </View>

      <View style={styles.statusSummaryRow}>
        {statusCounts.map((statusCount) => {
          const presentation = statusChipPresentation(statusCount.status);
          const CountIcon = presentation.Icon;

          return (
            <View key={statusCount.status} style={[styles.statusPill, presentation.pillStyle]}>
              <CountIcon color={presentation.iconColor} size={12} strokeWidth={2.4} />
              <Text style={[styles.statusText, presentation.textStyle]}>
                {statusCount.count} {t(`inbox.requests.status.${presentation.key}` as const)}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.dateChipList}>
        {sortedBookings.map((booking) => (
          <View key={booking.id} style={styles.dateChip}>
            <Text style={styles.dateChipText}>
              {formatDateTime(booking.scheduledDeparture, lang)}
            </Text>
          </View>
        ))}
      </View>

      {status.pendingCount === 0 &&
      status.acceptedCount > 0 &&
      status.rejectedCount === 0 &&
      status.cancelledCount === 0 &&
      status.expiredCount === 0 ? (
        <Text style={styles.acceptedSummary}>{t('inbox.sent.acceptedConfirmation')}</Text>
      ) : null}

      {status.pendingCount === 0 && status.rejectedCount > 0 && status.acceptedCount === 0 ? (
        <Text style={styles.rejectedSummary}>{t('inbox.sent.rejectedConfirmation')}</Text>
      ) : null}

      {message ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageLabel}>{t('inbox.sent.message')}</Text>
          <Text numberOfLines={3} style={styles.messageText}>
            {message}
          </Text>
        </View>
      ) : null}

      {shouldShowAcceptedNotification ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            busy: isDismissingAccepted,
            disabled: isDismissingAccepted,
          }}
          disabled={isDismissingAccepted}
          onPress={() => onDismissAccepted(group)}
          style={({ pressed }) => [
            styles.dismissButton,
            pressed && !isDismissingAccepted ? styles.pressed : null,
            isDismissingAccepted ? styles.disabledButton : null,
          ]}
        >
          {isDismissingAccepted ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Palette.textOnPrimary} size="small" />
              <Text style={styles.dismissButtonText}>{t('inbox.sent.dismissing')}</Text>
            </View>
          ) : (
            <Text style={styles.dismissButtonText}>{t('inbox.sent.ok')}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.cardSoft,
  },
  pendingCard: {
    borderLeftColor: Palette.warning,
  },
  acceptedCard: {
    borderLeftColor: Palette.success,
  },
  rejectedCard: {
    borderLeftColor: Palette.danger,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  dateRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dateTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dateText: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  pendingPill: {
    backgroundColor: Palette.backgroundMuted,
  },
  acceptedPill: {
    backgroundColor: Palette.successSurface,
  },
  rejectedPill: {
    backgroundColor: Palette.dangerSurface,
  },
  statusText: {
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pendingText: {
    color: Palette.textSecondary,
  },
  acceptedText: {
    color: Palette.success,
  },
  rejectedText: {
    color: Palette.danger,
  },
  statusSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  dateChipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  dateChip: {
    borderRadius: Radii.pill,
    backgroundColor: Palette.backgroundMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  dateChipText: {
    color: Palette.text,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  acceptedSummary: {
    color: Palette.success,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    lineHeight: 19,
  },
  rejectedSummary: {
    color: Palette.danger,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    lineHeight: 19,
  },
  messageBox: {
    backgroundColor: Palette.backgroundMuted,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  messageLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  messageText: {
    color: Palette.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    lineHeight: 18,
  },
  dismissButton: {
    minHeight: 42,
    borderRadius: Radii.md,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  dismissButtonText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  pressed: {
    opacity: 0.86,
  },
  disabledButton: {
    opacity: 0.65,
  },
});
