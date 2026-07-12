import { ArrowLeft } from 'lucide-react-native';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette, Spacing, Typography } from '@/shared/theme';
import { BrandLogo } from '@/shared/ui/components/brand-logo';

type ScreenHeaderProps = {
  /** Big brand wordmark in primary green. Used on the Find tab. */
  brand?: string;
  /** Plain dark title. Used on Profile / Create. */
  title?: string;
  subtitle?: string;
  /** Optional element rendered on the right side of the heading row (e.g. an action icon). */
  rightAction?: ReactNode;
  /** When set, renders an inline back arrow left of the title. */
  back?: { onPress: () => void; accessibilityLabel?: string };
  /** Optional slot rendered below the title row, above the bottom border (e.g. a segmented control). */
  bottom?: ReactNode;
  /** When set, wraps the title in a Pressable. Subtitle stays static. */
  onTitlePress?: () => void;
  titleAccessibilityLabel?: string;
};

/**
 * Inline screen header matching the mockup layout: white background, sits below
 * the safe-area inset, hairline bottom border. One of `brand` or `title` is
 * rendered as the heading. Pair with `headerShown: false` on the parent stack.
 */
export function ScreenHeader({
  brand,
  title,
  subtitle,
  rightAction,
  back,
  bottom,
  onTitlePress,
  titleAccessibilityLabel,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        Boolean(bottom) && styles.containerWithBottom,
        { paddingTop: insets.top + Spacing.sm },
      ]}
    >
      <View style={styles.row}>
        {back ? (
          <Pressable
            accessibilityLabel={back.accessibilityLabel}
            accessibilityRole="button"
            hitSlop={10}
            onPress={back.onPress}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <ArrowLeft color={Palette.text} size={22} strokeWidth={2.4} />
          </Pressable>
        ) : null}
        <View style={styles.textColumn}>
          {brand ? (
            <View style={styles.brandLogoWrap}>
              <BrandLogo accessibilityLabel={brand} />
            </View>
          ) : title ? (
            onTitlePress ? (
              <Pressable
                accessibilityLabel={titleAccessibilityLabel ?? title}
                accessibilityRole="button"
                hitSlop={6}
                onPress={onTitlePress}
                style={({ pressed }) => pressed && styles.titlePressed}
              >
                <Text numberOfLines={2} style={styles.title}>
                  {title}
                </Text>
              </Pressable>
            ) : (
              <Text numberOfLines={2} style={styles.title}>
                {title}
              </Text>
            )
          ) : null}
          {subtitle ? (
            <Text ellipsizeMode="tail" numberOfLines={2} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightAction ? <View style={styles.action}>{rightAction}</View> : null}
      </View>
      {bottom ? <View style={styles.bottom}>{bottom}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Palette.background,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  containerWithBottom: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xxl,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.sm,
  },
  backButtonPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  brandLogoWrap: {
    marginLeft: -38,
  },
  title: {
    ...Typography.display,
    color: Palette.text,
    flexShrink: 1,
  },
  titlePressed: {
    opacity: 0.7,
  },
  subtitle: {
    ...Typography.bodySmall,
    marginTop: 1,
    color: Palette.textSecondary,
    flexShrink: 1,
  },
  action: {
    flexShrink: 0,
    justifyContent: 'center',
  },
  bottom: {
    marginTop: Spacing.md,
  },
});
