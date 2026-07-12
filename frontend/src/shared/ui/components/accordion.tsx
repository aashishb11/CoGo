import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';

type Props = {
  title: string;
  icon?: LucideIcon;
  /** Optional small badge rendered next to the title (e.g. active filter count). */
  badge?: number;
  /** Controlled open state. If omitted, the component manages its own state. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /** Initial state when uncontrolled. */
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * Card-style collapsible section: header with title (optional icon + badge) and
 * a chevron that toggles the body visibility. Works controlled (pass `open` +
 * `onOpenChange`) or uncontrolled.
 */
export function Accordion({
  title,
  icon: Icon,
  badge,
  open,
  onOpenChange,
  defaultOpen = false,
  children,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  function toggle() {
    const next = !isOpen;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={toggle}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          {Icon ? <Icon color={Palette.primary} size={18} /> : null}
          <Text style={styles.title}>{title}</Text>
          {badge && badge > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {isOpen ? (
          <ChevronUp color={Palette.textSecondary} size={20} />
        ) : (
          <ChevronDown color={Palette.textSecondary} size={20} />
        )}
      </Pressable>
      {isOpen ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: Spacing.xs + 2,
    borderRadius: Radii.pill,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  body: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
});
