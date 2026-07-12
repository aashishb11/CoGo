import { ArrowRightCircle, Building2, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { OrgMember, Organization } from '../types';

import { Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type Props = {
  user: OrgMember | null;
  fromOrgId: string | null;
  orgs: Organization[];
  visible: boolean;
  onClose: () => void;
  onConfirm: (targetOrgId: string) => void;
};

export function MoveUserModal({ user, fromOrgId, orgs, visible, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const targetOrgs = useMemo(() => {
    const candidates = orgs.filter((o) => o.id !== fromOrgId);
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (o) => o.name.toLowerCase().includes(q) || o.domain.toLowerCase().includes(q),
    );
  }, [orgs, fromOrgId, search]);

  function handleClose() {
    setSearch('');
    onClose();
  }

  function handleConfirm(orgId: string) {
    setSearch('');
    onConfirm(orgId);
  }

  return (
    <Modal animationType="fade" onRequestClose={handleClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable onPress={handleClose} style={StyleSheet.absoluteFill} />

        <View style={styles.popup}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{t('admin.move.title')}</Text>
              {user ? (
                <View style={styles.userRow}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{user.name.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.userName}>
                    {user.name}
                  </Text>
                </View>
              ) : null}
            </View>
            <Pressable hitSlop={12} onPress={handleClose} style={styles.closeBtn}>
              <X color={Palette.textSecondary} size={20} />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <Search color={Palette.textSecondary} size={16} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setSearch}
              placeholder={t('admin.move.search.placeholder')}
              placeholderTextColor={Palette.textSecondary}
              style={styles.searchInput}
              value={search}
            />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.list}
          >
            {targetOrgs.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Building2 color={Palette.textSecondary} size={28} />
                <Text style={styles.emptyText}>{t('admin.dashboard.orgs.empty')}</Text>
              </View>
            ) : (
              targetOrgs.map((org, i) => (
                <Pressable
                  key={org.id}
                  onPress={() => handleConfirm(org.id)}
                  style={({ pressed }) => [
                    styles.orgRow,
                    i < targetOrgs.length - 1 && styles.orgRowBorder,
                    pressed && styles.orgRowPressed,
                  ]}
                >
                  <View style={styles.orgIcon}>
                    <Building2 color={Palette.primary} size={16} />
                  </View>
                  <View style={styles.orgInfo}>
                    <Text numberOfLines={1} style={styles.orgName}>
                      {org.name}
                    </Text>
                    <Text style={styles.orgDomain}>{org.domain}</Text>
                  </View>
                  <ArrowRightCircle color={Palette.primary} size={20} />
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Palette.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  popup: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    overflow: 'hidden',
    maxHeight: '80%',
    ...Shadow.authCard,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
    gap: Spacing.md,
  },
  headerText: {
    flex: 1,
    gap: Spacing.sm,
  },
  title: {
    color: Palette.text,
    fontSize: 17,
    fontWeight: '700',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  userAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Palette.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    color: Palette.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  userName: {
    color: Palette.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.backgroundMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Palette.backgroundMuted,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.border,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md - 2,
    fontSize: 14,
    color: Palette.text,
  },
  list: {
    maxHeight: 320,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: 14,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  orgRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  orgRowPressed: {
    backgroundColor: Palette.primarySurface,
  },
  orgIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Palette.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgInfo: {
    flex: 1,
    gap: 2,
  },
  orgName: {
    color: Palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  orgDomain: {
    color: Palette.textSecondary,
    fontSize: 12,
  },
});
