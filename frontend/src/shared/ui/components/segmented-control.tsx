import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

export type SegmentedOption<TValue extends string> = {
  value: TValue;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

type Variant = 'pill' | 'underline';

type Props<TValue extends string> = {
  value: TValue;
  onChange: (next: TValue) => void;
  onDisabledPress?: (next: TValue) => void;
  options: SegmentedOption<TValue>[];
  testID?: string;
  /**
   * `pill` (default): bordered track with a sliding white indicator. Use inside
   * body content. `underline`: full-bleed tabs with a 2px indicator at the
   * bottom edge, designed to live inside `ScreenHeader.bottom`.
   */
  variant?: Variant;
};

/**
 * Segmented control with a sliding indicator that animates 220ms ease-out
 * between options. Two variants: `pill` (default) for body content,
 * `underline` for header tabs.
 */
export function SegmentedControl<TValue extends string>({
  value,
  onChange,
  onDisabledPress,
  options,
  testID,
  variant = 'pill',
}: Props<TValue>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const trackInset = variant === 'pill' ? 8 : 0;
  const optionWidth = trackWidth > 0 ? (trackWidth - trackInset) / options.length : 0;

  useEffect(() => {
    if (optionWidth === 0) return;
    Animated.timing(indicatorX, {
      toValue: activeIndex * optionWidth,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, optionWidth, indicatorX]);

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  const isUnderline = variant === 'underline';

  return (
    <View
      onLayout={handleLayout}
      style={isUnderline ? styles.trackUnderline : styles.track}
      testID={testID}
    >
      {optionWidth > 0 ? (
        <Animated.View
          style={[
            isUnderline ? styles.indicatorUnderline : styles.indicator,
            {
              width: optionWidth,
              transform: [{ translateX: indicatorX }],
            },
          ]}
        />
      ) : null}

      {options.map((option) => {
        const isActive = option.value === value;
        const isDisabled = option.disabled === true;
        const isPressableDisabled = isDisabled && !onDisabledPress;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isPressableDisabled, selected: isActive }}
            disabled={isPressableDisabled}
            key={option.value}
            onPress={() => {
              if (isDisabled) {
                onDisabledPress?.(option.value);
                return;
              }
              onChange(option.value);
            }}
            style={[
              isUnderline ? styles.optionUnderline : styles.option,
              isDisabled && styles.optionDisabled,
            ]}
          >
            <View style={styles.optionContent}>
              {option.icon}
              <Text
                style={[
                  styles.optionText,
                  isActive && styles.optionTextActive,
                  isDisabled && styles.optionTextDisabled,
                ]}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'relative',
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radii.pill,
    backgroundColor: Palette.border,
  },
  trackUnderline: {
    position: 'relative',
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: Radii.pill,
    backgroundColor: Palette.card,
    ...Shadow.cardSoft,
  },
  indicatorUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    height: 3,
    backgroundColor: Palette.primary,
  },
  option: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  optionUnderline: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  optionDisabled: {
    opacity: 0.48,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  optionText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 18,
    fontWeight: FontWeight.semibold,
  },
  optionTextActive: {
    color: Palette.primaryDark,
    fontWeight: FontWeight.bold,
  },
  optionTextDisabled: {
    color: Palette.textSecondary,
  },
});
