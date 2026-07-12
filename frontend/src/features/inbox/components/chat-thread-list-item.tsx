import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useChatThreadTripLabel } from '@/features/inbox/chat-queries';
import type { ChatThread } from '@/features/inbox/chat-types';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type ChatThreadListItemProps = {
  thread: ChatThread;
  onPress: (threadId: string) => void;
};

const LOCALE_MAP: Record<Lang, string> = {
  en: 'en-US',
  es: 'es-ES',
  ca: 'ca-ES',
};

function formatRelativeTime(value: string, lang: Lang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  try {
    if (sameDay) {
      return new Intl.DateTimeFormat(LOCALE_MAP[lang], {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }
    return new Intl.DateTimeFormat(LOCALE_MAP[lang], {
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    return '';
  }
}

export function ChatThreadListItem({ thread, onPress }: ChatThreadListItemProps) {
  const { i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;
  const time = formatRelativeTime(thread.lastMessageAt, lang);
  const hasUnread = thread.unreadCount > 0;
  const tripLabel = useChatThreadTripLabel(thread.tripId, thread.tripLabel);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(thread.id)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{thread.participantInitials}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text numberOfLines={1} style={styles.name}>
            {thread.participantName}
          </Text>
          {time ? <Text style={styles.time}>{time}</Text> : null}
        </View>

        <Text numberOfLines={1} style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}>
          {thread.lastMessage}
        </Text>

        <View style={styles.bottomRow}>
          <Text numberOfLines={1} style={styles.tripLabel}>
            {tripLabel}
          </Text>
          {hasUnread ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{thread.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.cardSoft,
  },
  pressed: {
    opacity: 0.86,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Palette.primaryDark,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  time: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  lastMessage: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    lineHeight: 18,
  },
  lastMessageUnread: {
    color: Palette.text,
    fontWeight: FontWeight.semibold,
  },
  bottomRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  tripLabel: {
    flex: 1,
    minWidth: 0,
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: Spacing.xs,
    borderRadius: 11,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.bold,
  },
});
