import { Check, Hourglass, type LucideIcon, Play, Users, X } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';

export type StatusVariant =
  | 'active'
  | 'in_progress'
  | 'confirmed'
  | 'pending'
  | 'accepted'
  | 'cancelled'
  | 'rejected'
  | 'archived'
  | 'expired'
  | 'full';

type Tone = {
  bg: string;
  fg: string;
  accent: string;
  Icon: LucideIcon;
};

const TONES: Record<StatusVariant, Tone> = {
  active: { bg: Palette.successSurface, fg: Palette.success, accent: Palette.primary, Icon: Check },
  in_progress: {
    bg: Palette.primarySurface,
    fg: Palette.primaryDark,
    accent: Palette.primary,
    Icon: Play,
  },
  confirmed: {
    bg: Palette.successSurface,
    fg: Palette.success,
    accent: Palette.primary,
    Icon: Check,
  },
  accepted: {
    bg: Palette.successSurface,
    fg: Palette.success,
    accent: Palette.primary,
    Icon: Check,
  },
  pending: {
    bg: Palette.warningSurface,
    fg: Palette.warning,
    accent: Palette.warning,
    Icon: Hourglass,
  },
  cancelled: { bg: Palette.dangerSurface, fg: Palette.danger, accent: Palette.danger, Icon: X },
  rejected: { bg: Palette.dangerSurface, fg: Palette.danger, accent: Palette.danger, Icon: X },
  archived: {
    bg: Palette.backgroundMuted,
    fg: Palette.textSecondary,
    accent: Palette.border,
    Icon: Hourglass,
  },
  expired: {
    bg: Palette.backgroundMuted,
    fg: Palette.textSecondary,
    accent: Palette.border,
    Icon: Hourglass,
  },
  full: {
    bg: Palette.backgroundMuted,
    fg: Palette.textSecondary,
    accent: Palette.border,
    Icon: Users,
  },
};

export function getStatusAccent(variant: StatusVariant): string {
  return TONES[variant].accent;
}

type StatusBadgeProps = {
  variant: StatusVariant;
  label: string;
};

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  const tone = TONES[variant];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <tone.Icon color={tone.fg} size={11} strokeWidth={2.5} />
      <Text style={[styles.label, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.sm - 2,
  },
  label: {
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
