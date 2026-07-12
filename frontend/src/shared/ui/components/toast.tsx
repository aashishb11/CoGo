import { CheckCircle, XCircle } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';

import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

export type ToastKind = 'success' | 'error';

type Props = {
  kind: ToastKind;
  message: string;
  visible: boolean;
  onDismiss: () => void;
  durationMs?: number;
};

export function Toast({ kind, message, visible, onDismiss, durationMs = 4500 }: Props) {
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
      const id = setTimeout(onDismiss, durationMs);
      return () => clearTimeout(id);
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 80,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, durationMs, onDismiss, translateY, opacity]);

  const Icon = kind === 'success' ? CheckCircle : XCircle;
  const color = kind === 'success' ? Palette.success : Palette.danger;
  const surface = kind === 'success' ? Palette.successSurface : Palette.dangerSurface;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        styles.container,
        {
          backgroundColor: surface,
          borderColor: color,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Icon color={color} size={20} strokeWidth={2.25} />
      <Text style={[styles.text, { color }]}>{message}</Text>
      <Pressable accessibilityLabel="Dismiss" hitSlop={10} onPress={onDismiss}>
        <Text style={[styles.dismiss, { color }]}>×</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
    ...Shadow.card,
    zIndex: 50,
  },
  text: {
    flex: 1,
    fontSize: FontSize.md,
    lineHeight: 20,
    fontWeight: FontWeight.semibold,
  },
  dismiss: {
    fontSize: FontSize['3xl'],
    lineHeight: 22,
    fontWeight: FontWeight.bold,
    paddingHorizontal: Spacing.xs,
  },
});
