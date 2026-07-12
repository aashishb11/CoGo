import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ChatMessage } from '@/features/inbox/chat-types';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';

type ChatMessageBubbleProps = {
  message: ChatMessage;
  onLongPress?: (message: ChatMessage) => void;
};

const LOCALE_MAP: Record<Lang, string> = {
  en: 'en-US',
  es: 'es-ES',
  ca: 'ca-ES',
};

function formatTime(value: string, lang: Lang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat(LOCALE_MAP[lang], {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '';
  }
}

export function ChatMessageBubble({ message, onLongPress }: ChatMessageBubbleProps) {
  const { i18n, t } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;
  const time = formatTime(message.sentAt, lang);
  const fromSelf = message.fromSelf;
  const deleted = message.deleted;
  const canLongPress = Boolean(onLongPress) && fromSelf && !deleted;

  const bodyText = deleted ? t('chat.message.deleted') : message.body;
  const bodyStyles = [
    styles.body,
    fromSelf ? styles.bodySelf : styles.bodyOther,
    deleted && styles.bodyDeleted,
  ];

  return (
    <View style={[styles.wrapper, fromSelf ? styles.alignEnd : styles.alignStart]}>
      <Pressable
        accessibilityRole={canLongPress ? 'button' : undefined}
        delayLongPress={300}
        onLongPress={canLongPress ? () => onLongPress?.(message) : undefined}
        style={({ pressed }) => [
          styles.bubble,
          fromSelf ? styles.bubbleSelf : styles.bubbleOther,
          canLongPress && pressed && styles.bubblePressed,
        ]}
      >
        <Text style={bodyStyles}>{bodyText}</Text>
        {time ? (
          <Text style={[styles.time, fromSelf ? styles.timeSelf : styles.timeOther]}>{time}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    flexDirection: 'row',
  },
  alignStart: {
    justifyContent: 'flex-start',
  },
  alignEnd: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.xl,
    gap: 2,
  },
  bubbleSelf: {
    backgroundColor: Palette.primary,
    borderBottomRightRadius: Radii.sm,
  },
  bubbleOther: {
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    borderBottomLeftRadius: Radii.sm,
  },
  bubblePressed: {
    opacity: 0.86,
  },
  body: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    lineHeight: 20,
  },
  bodySelf: {
    color: Palette.textOnPrimary,
  },
  bodyOther: {
    color: Palette.text,
  },
  bodyDeleted: {
    fontStyle: 'italic',
    opacity: 0.75,
  },
  time: {
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.semibold,
    alignSelf: 'flex-end',
  },
  timeSelf: {
    color: Palette.textOnPrimary,
    opacity: 0.85,
  },
  timeOther: {
    color: Palette.textSecondary,
  },
});
