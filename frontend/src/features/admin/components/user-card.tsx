import { ShieldCheck, ShieldOff } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ActionMenu, type ActionMenuItem } from '@/shared/ui/components/action-menu';

export type UserCardPerson = {
  id: string;
  name: string;
  email: string;
  role?: 'admin' | 'user' | null;
  banned?: boolean | null;
};

export type QuickAction = ActionMenuItem;

type Props = {
  user: UserCardPerson;
  onPress?: (userId: string) => void;
  flat?: boolean;
  quickActions?: QuickAction[];
};

export function UserCard({ user, onPress, flat = false, quickActions }: Props) {
  const { t } = useTranslation();
  const isAdmin = user.role === 'admin';
  const isBanned = user.banned === true;
  const hasMenu = quickActions && quickActions.length > 0;

  return (
    <View style={flat ? styles.flatOuter : styles.cardOuter}>
      <Pressable
        disabled={!onPress}
        onPress={() => onPress?.(user.id)}
        style={({ pressed }) => [
          styles.row,
          flat ? styles.rowFlat : styles.rowCard,
          pressed && onPress && styles.rowPressed,
        ]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.name.slice(0, 2).toUpperCase()}</Text>
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>
              {user.name}
            </Text>
            {isAdmin ? (
              <View accessibilityLabel={t('admin.user.role.admin')} style={styles.adminBadge}>
                <ShieldCheck color={Palette.primary} size={12} />
                <Text style={styles.adminBadgeText}>{t('admin.user.role.admin')}</Text>
              </View>
            ) : null}
            {isBanned ? (
              <View accessibilityLabel={t('admin.user.status.banned')} style={styles.bannedBadge}>
                <ShieldOff color={Palette.danger} size={12} />
                <Text style={styles.bannedBadgeText}>{t('admin.user.status.banned')}</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={styles.email}>
            {user.email}
          </Text>
        </View>

        {hasMenu ? <ActionMenu actions={quickActions} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.cardSoft,
  },
  flatOuter: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowCard: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.lg,
  },
  rowFlat: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  rowPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Palette.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: Palette.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  info: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  name: {
    color: Palette.text,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.sm,
    backgroundColor: Palette.primarySurface,
  },
  adminBadgeText: {
    color: Palette.primary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  bannedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.sm,
    backgroundColor: Palette.dangerSurface,
  },
  bannedBadgeText: {
    color: Palette.danger,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  email: {
    color: Palette.textSecondary,
    fontSize: 12,
  },
});
