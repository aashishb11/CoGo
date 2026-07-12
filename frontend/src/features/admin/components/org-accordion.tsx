import { useRouter } from 'expo-router';
import { ArrowLeftRight, Building2, ChevronDown, ChevronUp, UserMinus } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useRemoveMember } from '../queries';
import type { OrgMember, Organization } from '../types';

import { UserCard } from './user-card';

import { Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type Props = {
  org: Organization;
  forceOpen?: boolean;
  onMoveUser: (member: OrgMember, fromOrgId: string) => void;
};

export function OrgAccordion({ org, forceOpen = false, onMoveUser }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const removeMember = useRemoveMember();
  const isOpen = forceOpen || open;

  function handleUserPress(userId: string) {
    router.push({ pathname: '/admin/[id]' as never, params: { id: userId } });
  }

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        <View style={styles.headerLeft}>
          <View style={styles.orgIconWrap}>
            <Building2 color={Palette.primary} size={18} />
          </View>
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.orgName}>
              {org.name}
            </Text>
            <Text style={styles.orgDomain}>{org.domain}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{org.members.length}</Text>
          </View>
          {isOpen ? (
            <ChevronUp color={Palette.textSecondary} size={16} />
          ) : (
            <ChevronDown color={Palette.textSecondary} size={16} />
          )}
        </View>
      </Pressable>

      {isOpen ? (
        <View style={styles.body}>
          {org.members.length === 0 ? (
            <Text style={styles.emptyText}>{t('admin.org.users.empty')}</Text>
          ) : (
            org.members.map((member, i) => (
              <View key={member.id}>
                <UserCard
                  flat
                  onPress={handleUserPress}
                  quickActions={[
                    {
                      label: t('admin.move.button'),
                      icon: <ArrowLeftRight color={Palette.textSecondary} size={14} />,
                      onPress: () => onMoveUser(member, org.id),
                    },
                    {
                      label: t('admin.org.removeMember'),
                      icon: <UserMinus color={Palette.danger} size={14} />,
                      danger: true,
                      onPress: () => removeMember.mutate({ orgId: org.id, userId: member.id }),
                    },
                  ]}
                  user={member}
                />
                {i < org.members.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg + 2,
    borderWidth: 1,
    borderColor: Palette.border,
    overflow: 'visible',
    ...Shadow.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    borderRadius: Radii.lg + 2,
  },
  headerPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minWidth: 0,
  },
  orgIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Palette.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  orgName: {
    color: Palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  orgDomain: {
    color: Palette.textSecondary,
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Palette.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    color: Palette.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: Palette.border,
    paddingVertical: Spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: Palette.border,
    marginHorizontal: Spacing.sm,
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
});
