import { Calendar, CheckCircle, Clock, MapPin, MessageSquare, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { type BookingStatus, type InboxBooking, type InboxItem } from '@/features/inbox/api';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';

type InboxRequestDetailsModalProps = {
  item: InboxItem | null;
  visible: boolean;
  actionError?: string;
  isAccepting?: boolean;
  isRejecting?: boolean;
  onAccept?: (item: InboxItem) => void;
  onClose: () => void;
  onReject?: (item: InboxItem) => void;
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
      Icon: CheckCircle,
    };
  }

  if (status === 'pending') {
    return {
      bg: Palette.backgroundMuted,
      fg: Palette.textSecondary,
      Icon: Clock,
    };
  }

  return {
    bg: Palette.dangerSurface,
    fg: Palette.danger,
    Icon: X,
  };
}

function statusLabelKey(status: BookingStatus) {
  if (status === 'accepted') return 'accepted';
  if (status === 'rejected') return 'rejected';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'expired') return 'expired';
  return 'pending';
}

export function InboxRequestDetailsModal({
  item,
  visible,
  actionError,
  isAccepting = false,
  isRejecting = false,
  onAccept,
  onClose,
  onReject,
}: InboxRequestDetailsModalProps) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;

  const message = item ? readBookingMessage(item.bookings) : '';
  const hasPending = Boolean(item && item.pendingCount > 0);
  const isActionPending = isAccepting || isRejecting;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>{t('inbox.requests.detail.title')}</Text>
              {item ? (
                <Text numberOfLines={1} style={styles.subtitle}>
                  {item.passenger.name}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel={t('common.action.close')}
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={styles.closeButton}
            >
              <X color={Palette.textSecondary} size={20} />
            </Pressable>
          </View>

          {item ? (
            <ScrollView
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
            >
              <View style={styles.routeBox}>
                <MapPin color={Palette.primary} size={17} strokeWidth={2.3} />
                <Text numberOfLines={2} style={styles.routeText}>
                  {item.trip.originLabel}
                  {' -> '}
                  {item.trip.destinationLabel}
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t('inbox.requests.detail.message')}</Text>
                <View style={styles.messageBox}>
                  <MessageSquare color={Palette.textSecondary} size={16} strokeWidth={2.2} />
                  <Text style={styles.messageText}>
                    {message || t('inbox.requests.detail.noMessage')}
                  </Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t('inbox.requests.detail.dates')}</Text>
                <View style={styles.dateList}>
                  {item.bookings.map((booking) => {
                    const colors = statusColor(booking.status);
                    const StatusIcon = colors.Icon;

                    return (
                      <View key={booking.id} style={styles.dateRow}>
                        <Calendar color={Palette.textSecondary} size={16} strokeWidth={2.2} />
                        <View style={styles.dateTextWrap}>
                          <Text style={styles.dateText}>
                            {formatDateTime(booking.scheduledDeparture, lang)}
                          </Text>
                          <View style={[styles.statusPill, { backgroundColor: colors.bg }]}>
                            <StatusIcon color={colors.fg} size={11} strokeWidth={2.4} />
                            <Text style={[styles.statusText, { color: colors.fg }]}>
                              {t(
                                `inbox.requests.status.${statusLabelKey(booking.status)}` as const,
                              )}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          ) : null}

          {item && hasPending ? (
            <View style={styles.footer}>
              {actionError ? <Text style={formStyles.formError}>{actionError}</Text> : null}

              <View style={styles.actionsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ busy: isRejecting, disabled: isActionPending }}
                  disabled={isActionPending}
                  onPress={() => onReject?.(item)}
                  style={({ pressed }) => [
                    styles.rejectButton,
                    pressed && !isActionPending ? styles.pressed : null,
                    isActionPending ? styles.disabledButton : null,
                  ]}
                >
                  {isRejecting ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color={Palette.danger} size="small" />
                      <Text style={styles.rejectButtonText}>
                        {t('inbox.requests.action.declining')}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.rejectButtonText}>
                      {t('inbox.requests.action.decline')}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ busy: isAccepting, disabled: isActionPending }}
                  disabled={isActionPending}
                  onPress={() => onAccept?.(item)}
                  style={({ pressed }) => [
                    styles.acceptButton,
                    pressed && !isActionPending ? styles.pressed : null,
                    isActionPending ? styles.disabledButton : null,
                  ]}
                >
                  {isAccepting ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color={Palette.textOnPrimary} size="small" />
                      <Text style={styles.acceptButtonText}>
                        {t('inbox.requests.action.accepting')}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.acceptButtonText}>{t('inbox.requests.action.accept')}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Palette.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '82%',
    backgroundColor: Palette.background,
    borderRadius: Radii.xl,
    overflow: 'hidden',
    ...Shadow.authCard,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...Typography.titleSmall,
    color: Palette.text,
  },
  subtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  body: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
  },
  routeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.primarySurface,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  routeText: {
    flex: 1,
    color: Palette.primaryDark,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    lineHeight: 20,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Palette.backgroundMuted,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  messageText: {
    flex: 1,
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    lineHeight: 20,
  },
  dateList: {
    gap: Spacing.sm,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  dateTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  dateText: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Palette.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  rejectButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.danger,
    backgroundColor: Palette.dangerSurface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  rejectButtonText: {
    color: Palette.danger,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  acceptButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radii.md,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  acceptButtonText: {
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
