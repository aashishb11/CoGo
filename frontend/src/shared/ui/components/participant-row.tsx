import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';

type ParticipantRowProps = {
  name: string;
  subtitle?: string;
  /** Two-letter avatar fallback. If absent, derives from `name`. */
  initials?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  trailing?: ReactNode;
};

function deriveInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function ParticipantRow({
  name,
  subtitle,
  initials,
  onPress,
  accessibilityLabel,
  trailing,
}: ParticipantRowProps) {
  const letters = initials ?? deriveInitials(name);

  const content = (
    <>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{letters}</Text>
      </View>
      <View style={styles.textCol}>
        <Text numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rowPressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Palette.primaryDark,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  subtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  trailing: {
    flexShrink: 0,
  },
});
