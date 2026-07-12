import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Calendar, ChevronRight, Clock } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';

type Mode = 'date' | 'time';
type Variant = 'card' | 'inline';

type DateTimeFieldProps = {
  mode: Mode;
  value: Date;
  onChange: (next: Date) => void;
  /** Display label inside the trigger row. */
  displayLabel: string;
  /** Earliest selectable date (date mode only). */
  minimumDate?: Date;
  /** Latest selectable date (date mode only). */
  maximumDate?: Date;
  cancelLabel: string;
  doneLabel: string;
  style?: StyleProp<ViewStyle>;
  /**
   * `card` (default) renders the standalone bordered trigger.
   * `inline` renders a borderless row designed to live inside another card —
   * left label + right value + chevron, so multiple fields can stack with
   * shared dividers.
   */
  variant?: Variant;
  /** Inline-only: small uppercase label rendered to the left of the value. */
  inlineLabel?: string;
};

/**
 * Cross-platform native date/time trigger.
 *
 * - **Android**: opens the native dialog imperatively via `DateTimePickerAndroid.open`.
 * - **iOS**: shows a modal sheet with a wheel `DateTimePicker` (the inline mode
 *   forces us to manage layout, which is awkward inside a scroll view; the
 *   sheet keeps the trigger predictable across screens).
 * - **Web**: renders the underlying `<input type="date|time">` via the
 *   community shim.
 */
export function DateTimeField({
  mode,
  value,
  onChange,
  displayLabel,
  minimumDate,
  maximumDate,
  cancelLabel,
  doneLabel,
  style,
  variant = 'card',
  inlineLabel,
}: DateTimeFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState(value);

  const open = useCallback(() => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode,
        is24Hour: true,
        minimumDate,
        maximumDate,
        onChange: (event: DateTimePickerEvent, next?: Date) => {
          if (event.type === 'set' && next) onChange(next);
        },
      });
      return;
    }
    setIosDraft(value);
    setIosOpen(true);
  }, [maximumDate, minimumDate, mode, onChange, value]);

  const Icon = mode === 'date' ? Calendar : Clock;

  return (
    <>
      {variant === 'inline' ? (
        <Pressable
          accessibilityRole="button"
          onPress={open}
          style={({ pressed }) => [styles.inlineTrigger, pressed && styles.triggerPressed, style]}
        >
          {inlineLabel ? <Text style={styles.inlineLabel}>{inlineLabel}</Text> : null}
          <Text numberOfLines={1} style={styles.inlineValue}>
            {displayLabel}
          </Text>
          <ChevronRight color={Palette.textSecondary} size={16} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={open}
          style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed, style]}
        >
          <Icon color={Palette.primary} size={16} />
          <Text style={styles.triggerText}>{displayLabel}</Text>
        </Pressable>
      )}

      {Platform.OS === 'ios' ? (
        <Modal
          animationType="fade"
          onRequestClose={() => setIosOpen(false)}
          transparent
          visible={iosOpen}
        >
          <Pressable onPress={() => setIosOpen(false)} style={styles.backdrop}>
            <Pressable onPress={() => undefined} style={styles.sheet}>
              <DateTimePicker
                // Date uses iOS 14+ calendar grid (`inline`); time uses the
                // wheels (`spinner`) — both need explicit width inside a
                // Modal sheet or they collapse to zero on iOS.
                display={mode === 'date' ? 'inline' : 'spinner'}
                maximumDate={mode === 'date' ? (maximumDate ?? undefined) : undefined}
                minimumDate={mode === 'date' ? (minimumDate ?? undefined) : undefined}
                mode={mode}
                onChange={(_event, next) => {
                  if (next) setIosDraft(next);
                }}
                style={mode === 'date' ? styles.iosDatePicker : styles.iosTimePicker}
                themeVariant="light"
                value={iosDraft}
              />
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIosOpen(false)}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.actionGhost,
                    pressed && styles.actionPressed,
                  ]}
                >
                  <Text style={styles.actionGhostText}>{cancelLabel}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(iosDraft);
                    setIosOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.actionPrimary,
                    pressed && styles.actionPressed,
                  ]}
                >
                  <Text style={styles.actionPrimaryText}>{doneLabel}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {Platform.OS === 'web' && iosOpen ? (
        <DateTimePicker
          display="default"
          maximumDate={mode === 'date' ? (maximumDate ?? undefined) : undefined}
          minimumDate={mode === 'date' ? (minimumDate ?? undefined) : undefined}
          mode={mode}
          onChange={(_event, next) => {
            if (next) onChange(next);
            setIosOpen(false);
          }}
          value={value}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 52,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  triggerPressed: {
    opacity: 0.85,
  },
  triggerText: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
  inlineTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 56,
  },
  inlineLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    width: 96,
  },
  inlineValue: {
    flex: 1,
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    textAlign: 'right',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Palette.card,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  iosDatePicker: {
    width: '100%',
    alignSelf: 'center',
  },
  iosTimePicker: {
    width: '100%',
    height: 216,
    alignSelf: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGhost: {
    backgroundColor: Palette.backgroundMuted,
  },
  actionGhostText: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  actionPrimary: {
    backgroundColor: Palette.primary,
  },
  actionPrimaryText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  actionPressed: {
    opacity: 0.85,
  },
});
