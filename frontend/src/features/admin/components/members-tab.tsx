import { useRouter } from 'expo-router';
import { ArrowLeftRight, Search, Shield, ShieldOff } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAdminOrgs, useAdminUsers, useMoveUser, useSetUserRole } from '../queries';
import type { AdminUserListItem } from '../types';

import { MoveUserModal } from './move-user-modal';
import { UserCard } from './user-card';

import { useSession } from '@/features/auth/queries';
import { Palette, Radii, Spacing } from '@/shared/theme';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function confirmRoleChange(
  title: string,
  message: string,
  acceptLabel: string,
  cancelLabel: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: acceptLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export function MembersTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [bannedOnly, setBannedOnly] = useState(false);
  const debounced = useDebouncedValue(search, 300);
  const usersQuery = useAdminUsers(debounced);
  const setRole = useSetUserRole();
  const session = useSession();
  const currentUserId = session.data?.user?.id ?? null;
  const [pendingAssign, setPendingAssign] = useState<AdminUserListItem | null>(null);
  const orgsQuery = useAdminOrgs();
  const moveUser = useMoveUser();

  // Client-side filter — the better-auth list endpoint doesn't expose a banned
  // operator, and the page is already capped at limit:50, so filtering in
  // memory is cheap and avoids a separate BE shape just for this toggle.
  const visibleUsers = useMemo(() => {
    const users = usersQuery.data?.users ?? [];
    return bannedOnly ? users.filter((u) => u.banned === true) : users;
  }, [usersQuery.data?.users, bannedOnly]);

  function handleUserPress(userId: string) {
    router.push({ pathname: '/admin/[id]' as never, params: { id: userId } });
  }

  function handleToggleRole(user: AdminUserListItem) {
    const promote = user.role !== 'admin';
    const targetRole: 'admin' | 'user' = promote ? 'admin' : 'user';
    confirmRoleChange(
      promote ? t('admin.members.promote.confirm.title') : t('admin.members.demote.confirm.title'),
      (promote
        ? t('admin.members.promote.confirm.message')
        : t('admin.members.demote.confirm.message')
      ).replace('{{name}}', user.name),
      promote ? t('admin.members.promote.button') : t('admin.members.demote.button'),
      t('admin.org.create.cancel'),
      () => setRole.mutate({ userId: user.id, role: targetRole }),
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Search color={Palette.textSecondary} size={16} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setSearch}
          placeholder={t('admin.members.search.placeholder')}
          placeholderTextColor={Palette.textSecondary}
          style={styles.searchInput}
          value={search}
        />
      </View>

      <View style={styles.filterRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: bannedOnly }}
          onPress={() => setBannedOnly((v) => !v)}
          style={({ pressed }) => [
            styles.filterChip,
            bannedOnly && styles.filterChipActive,
            pressed && styles.filterChipPressed,
          ]}
        >
          <ShieldOff
            color={bannedOnly ? Palette.danger : Palette.textSecondary}
            size={14}
            strokeWidth={2.25}
          />
          <Text style={[styles.filterChipText, bannedOnly && styles.filterChipTextActive]}>
            {t('admin.members.filter.bannedOnly')}
          </Text>
        </Pressable>
      </View>

      {usersQuery.isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={Palette.primary} size="small" />
          <Text style={styles.loadingText}>{t('admin.dashboard.loading')}</Text>
        </View>
      ) : !usersQuery.data || visibleUsers.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>
            {bannedOnly
              ? t('admin.members.filter.bannedEmpty')
              : debounced
                ? t('admin.dashboard.search.empty')
                : t('admin.members.empty')}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {visibleUsers.map((user) => {
            const isSelf = currentUserId !== null && user.id === currentUserId;
            const isAdmin = user.role === 'admin';
            const isPending = setRole.isPending && setRole.variables?.userId === user.id;

            const quickActions = isSelf
              ? []
              : [
                  {
                    label: isAdmin
                      ? t('admin.members.demote.button')
                      : t('admin.members.promote.button'),
                    icon: isAdmin ? (
                      <ShieldOff color={Palette.danger} size={14} />
                    ) : (
                      <Shield color={Palette.textSecondary} size={14} />
                    ),
                    onPress: () => handleToggleRole(user),
                    danger: isAdmin,
                    disabled: isPending,
                  },
                  {
                    label: t('admin.move.button'),
                    icon: <ArrowLeftRight color={Palette.textSecondary} size={14} />,
                    onPress: () => setPendingAssign(user),
                  },
                ];

            return (
              <UserCard
                key={user.id}
                onPress={handleUserPress}
                quickActions={quickActions}
                user={user}
              />
            );
          })}
          {!bannedOnly && usersQuery.data.total > usersQuery.data.users.length ? (
            <Text style={styles.refineHint}>
              {t('admin.members.refine').replace('{{total}}', String(usersQuery.data.total))}
            </Text>
          ) : null}
        </View>
      )}
      <MoveUserModal
        fromOrgId={null}
        onClose={() => setPendingAssign(null)}
        onConfirm={(toOrgId) => {
          if (!pendingAssign) return;
          moveUser.mutate({ userId: pendingAssign.id, fromOrgId: null, toOrgId });
          setPendingAssign(null);
        }}
        orgs={orgsQuery.data ?? []}
        user={pendingAssign}
        visible={pendingAssign !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.lg,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontSize: 15,
    color: Palette.text,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  filterChipActive: {
    borderColor: Palette.danger,
    backgroundColor: Palette.dangerSurface,
  },
  filterChipPressed: {
    opacity: 0.85,
  },
  filterChipText: {
    color: Palette.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: Palette.danger,
  },
  list: {
    gap: Spacing.sm,
  },
  centerContainer: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    color: Palette.textSecondary,
    fontSize: 14,
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  refineHint: {
    color: Palette.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    paddingTop: Spacing.sm,
  },
});
