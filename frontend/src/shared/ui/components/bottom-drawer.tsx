import { X } from 'lucide-react-native';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type BottomDrawerProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  accessibilityLabel?: string;
  drawerStyle?: StyleProp<ViewStyle>;
};

export function BottomDrawer({
  visible,
  onClose,
  title,
  children,
  accessibilityLabel,
  drawerStyle,
}: BottomDrawerProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: 150,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [progress, visible]);

  if (!mounted) return null;

  const drawerTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      transparent
      visible={mounted}
      statusBarTranslucent
    >
      <View accessibilityLabel={accessibilityLabel} style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]} />
        <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <Animated.View
          style={[
            styles.drawer,
            { paddingBottom: Math.max(insets.bottom, Spacing.lg) },
            drawerStyle,
            { opacity: progress, transform: [{ translateY: drawerTranslateY }] },
          ]}
        >
          <View style={styles.handle} />
          {title ? (
            <View style={styles.header}>
              <Text numberOfLines={1} style={styles.title}>
                {title}
              </Text>
              <Pressable
                accessibilityLabel={title}
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
              >
                <X color={Palette.textSecondary} size={18} />
              </Pressable>
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Palette.overlay,
  },
  drawer: {
    width: '100%',
    maxHeight: '82%',
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    backgroundColor: Palette.card,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    ...Shadow.card,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: Radii.pill,
    backgroundColor: Palette.border,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  title: {
    flex: 1,
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.backgroundMuted,
  },
  closeButtonPressed: {
    opacity: 0.72,
  },
});
