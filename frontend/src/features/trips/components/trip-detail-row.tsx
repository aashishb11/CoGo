import { StyleSheet, Text, View } from 'react-native';

import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';

type TripDetailRowProps = {
  label: string;
  value: string;
  /** When true, omits the bottom hairline (used for the last row in a card). */
  last?: boolean;
};

export function TripDetailRow({ label, value, last }: TripDetailRowProps) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: Spacing.sm + 2,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  label: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.medium,
  },
});
