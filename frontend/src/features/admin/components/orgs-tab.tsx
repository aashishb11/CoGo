import { Plus, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAdminOrgs, useMoveUser } from '../queries';
import type { OrgMember } from '../types';

import { CreateOrgModal } from './create-org-modal';
import { MoveUserModal } from './move-user-modal';
import { OrgAccordion } from './org-accordion';

import { Palette, Radii, Spacing } from '@/shared/theme';

export function OrgsTab() {
  const { t } = useTranslation();
  const orgsQuery = useAdminOrgs();
  const moveUser = useMoveUser();

  const [orgSearch, setOrgSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [pendingMove, setPendingMove] = useState<{
    member: OrgMember;
    fromOrgId: string;
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const isUserSearching = userSearch.trim().length > 0;

  const filteredOrgs = useMemo(() => {
    let orgs = orgsQuery.data ?? [];

    const oq = orgSearch.trim().toLowerCase();
    if (oq) {
      orgs = orgs.filter(
        (o) => o.name.toLowerCase().includes(oq) || o.domain.toLowerCase().includes(oq),
      );
    }

    const uq = userSearch.trim().toLowerCase();
    if (uq) {
      orgs = orgs
        .map((org) => ({
          ...org,
          members: org.members.filter(
            (m) => m.name.toLowerCase().includes(uq) || m.email.toLowerCase().includes(uq),
          ),
        }))
        .filter((org) => org.members.length > 0);
    }

    return orgs;
  }, [orgsQuery.data, orgSearch, userSearch]);

  function handleMoveConfirm(toOrgId: string) {
    if (!pendingMove) return;
    if (moveUser.isPending) return;
    moveUser.mutate({ userId: pendingMove.member.id, fromOrgId: pendingMove.fromOrgId, toOrgId });
    setPendingMove(null);
  }

  function handleMoveRequest(member: OrgMember, fromOrgId: string) {
    if (moveUser.isPending) return;
    setPendingMove({ member, fromOrgId });
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Search color={Palette.textSecondary} size={16} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setOrgSearch}
          placeholder={t('admin.dashboard.org.search.placeholder')}
          placeholderTextColor={Palette.textSecondary}
          style={styles.searchInput}
          value={orgSearch}
        />
      </View>

      <View style={styles.searchWrap}>
        <Search color={Palette.textSecondary} size={16} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setUserSearch}
          placeholder={t('admin.dashboard.search.placeholder')}
          placeholderTextColor={Palette.textSecondary}
          style={styles.searchInput}
          value={userSearch}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setCreateOpen(true)}
        style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}
      >
        <Plus color={Palette.textOnPrimary} size={18} />
        <Text style={styles.createButtonText}>{t('admin.org.create.button')}</Text>
      </Pressable>

      {orgsQuery.isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={Palette.primary} size="small" />
          <Text style={styles.loadingText}>{t('admin.dashboard.loading')}</Text>
        </View>
      ) : filteredOrgs.length > 0 ? (
        <View style={styles.list}>
          {filteredOrgs.map((org) => (
            <OrgAccordion
              key={org.id}
              forceOpen={isUserSearching}
              onMoveUser={handleMoveRequest}
              org={org}
            />
          ))}
        </View>
      ) : (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>
            {isUserSearching ? t('admin.dashboard.search.empty') : t('admin.dashboard.orgs.empty')}
          </Text>
        </View>
      )}

      <MoveUserModal
        fromOrgId={pendingMove?.fromOrgId ?? null}
        onClose={() => setPendingMove(null)}
        onConfirm={handleMoveConfirm}
        orgs={orgsQuery.data ?? []}
        user={pendingMove?.member ?? null}
        visible={pendingMove !== null}
      />

      <CreateOrgModal onClose={() => setCreateOpen(false)} visible={createOpen} />
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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: Palette.primary,
    borderRadius: Radii.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  createButtonPressed: {
    opacity: 0.88,
  },
  createButtonText: {
    color: Palette.textOnPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  list: {
    gap: Spacing.md,
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
});
