import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  /** Currently selected value, or `null` when no option is picked. */
  value: T | null;
  /** Tapping the active pill clears the selection (`null`). */
  onChange: (next: T | null) => void;
};

/**
 * Wrapping pill row for single-select filters that can also be cleared by
 * tapping the active pill again. Used in search/filter UIs where "no filter"
 * is a valid state.
 */
export function FilterPillGroup<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(selected ? null : option.value)}
            style={[styles.pill, selected && styles.pillSelected]}
          >
            <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pill: {
    minHeight: 34,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillSelected: {
    backgroundColor: Palette.primarySurface,
    borderColor: Palette.primary,
  },
  pillText: {
    color: Palette.text,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  pillTextSelected: {
    color: Palette.primaryDark,
  },
});
