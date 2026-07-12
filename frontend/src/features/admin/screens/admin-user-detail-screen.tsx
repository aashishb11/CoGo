import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, LogOut, Pencil, Shield, ShieldOff } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  useBanUser,
  useAdminUser,
  useRevokeUserSessions,
  useUnbanUser,
  useUpdateAdminUser,
  useVerifyUserEmail,
} from '../queries';

import { useRequireAuth } from '@/features/auth/queries';
import { popOrReplace } from '@/shared/navigation/back';
import { Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.fieldRow, last && styles.fieldRowLast]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function confirm(title: string, message: string, destructiveLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: destructiveLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export default function AdminUserDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useRequireAuth();
  const sessionUser = session.data?.user ?? null;
  const sessionRole = (sessionUser as { role?: string | null } | null)?.role ?? null;

  const userQuery = useAdminUser(sessionRole === 'admin' ? id : null);
  const user = userQuery.data ?? null;

  const updateUser = useUpdateAdminUser();
  const verifyEmail = useVerifyUserEmail();
  const banMutation = useBanUser();
  const unbanMutation = useUnbanUser();
  const revokeSessions = useRevokeUserSessions();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  function handleBack() {
    popOrReplace(router, '/admin' as never);
  }

  function startEditName() {
    setNameInput(user?.name ?? '');
    setEditingName(true);
  }

  function handleSaveName() {
    if (!user || !nameInput.trim()) return;
    updateUser.mutate(
      { userId: user.id, data: { name: nameInput.trim() } },
      { onSuccess: () => setEditingName(false) },
    );
  }

  function handleVerifyEmail() {
    if (!user) return;
    verifyEmail.mutate(user.id);
  }

  function handleBan() {
    if (!user) return;
    confirm(
      t('admin.user.actions.ban.button'),
      t('admin.user.actions.ban.confirm', { name: user.name }),
      t('admin.user.actions.ban.button'),
      () => banMutation.mutate({ userId: user.id }),
    );
  }

  function handleUnban() {
    if (!user) return;
    unbanMutation.mutate(user.id);
  }

  function handleRevokeSessions() {
    if (!user) return;
    confirm(
      t('admin.user.actions.revokeSessions.button'),
      t('admin.user.actions.revokeSessions.confirm', { name: user.name }),
      t('admin.user.actions.revokeSessions.button'),
      () => revokeSessions.mutate(user.id),
    );
  }

  if (session.isPending) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={Palette.primary} size="small" />
      </View>
    );
  }

  if (!sessionUser) return null;

  if (sessionRole !== 'admin') {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack, accessibilityLabel: t('viewProfile.back') }}
        title={user?.name}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {userQuery.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={Palette.primary} size="small" />
            </View>
          ) : userQuery.isError || !user ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{t('admin.user.notFound')}</Text>
            </View>
          ) : (
            <>
              {/* Avatar card */}
              <View style={styles.avatarCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.name.slice(0, 2).toUpperCase()}</Text>
                </View>

                {editingName ? (
                  <View style={styles.editNameRow}>
                    <TextInput
                      autoFocus
                      onChangeText={setNameInput}
                      placeholder={t('admin.user.actions.editName_placeholder')}
                      placeholderTextColor={Palette.textSecondary}
                      style={styles.editNameInput}
                      value={nameInput}
                    />
                    <Pressable
                      disabled={updateUser.isPending}
                      onPress={handleSaveName}
                      style={({ pressed }) => [
                        styles.editNameBtn,
                        styles.editNameBtnSave,
                        pressed && styles.editNameBtnPressed,
                      ]}
                    >
                      {updateUser.isPending ? (
                        <ActivityIndicator color={Palette.textOnPrimary} size="small" />
                      ) : (
                        <Text style={styles.editNameBtnTextSave}>
                          {t('admin.user.actions.editName_save')}
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => setEditingName(false)}
                      style={({ pressed }) => [
                        styles.editNameBtn,
                        styles.editNameBtnCancel,
                        pressed && styles.editNameBtnPressed,
                      ]}
                    >
                      <Text style={styles.editNameBtnTextCancel}>
                        {t('admin.user.actions.editName_cancel')}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={startEditName} style={styles.nameRow}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Pencil color={Palette.textSecondary} size={14} />
                  </Pressable>
                )}

                <Text style={styles.userEmail}>{user.email}</Text>

                <View style={styles.badgeRow}>
                  <View
                    style={[
                      styles.badge,
                      user.emailVerified ? styles.badgeSuccess : styles.badgeWarning,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        user.emailVerified ? styles.badgeTextSuccess : styles.badgeTextWarning,
                      ]}
                    >
                      {user.emailVerified
                        ? t('admin.user.status.verified')
                        : t('admin.user.status.unverified')}
                    </Text>
                  </View>
                  {user.role === 'admin' && (
                    <View style={[styles.badge, styles.badgePrimary]}>
                      <Text style={[styles.badgeText, styles.badgeTextPrimary]}>
                        {t('admin.user.role.admin')}
                      </Text>
                    </View>
                  )}
                  {user.banned && (
                    <View style={[styles.badge, styles.badgeDanger]}>
                      <Text style={[styles.badgeText, styles.badgeTextDanger]}>
                        {t('admin.user.status.banned')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Fields card */}
              <View style={styles.card}>
                <View style={styles.fieldsContainer}>
                  <DetailRow label={t('admin.user.field.id')} value={user.id} />
                  <DetailRow label={t('admin.user.field.name')} value={user.name} />
                  <DetailRow label={t('admin.user.field.email')} value={user.email} />
                  <DetailRow
                    label={t('admin.user.field.role')}
                    value={
                      user.role === 'admin' ? t('admin.user.role.admin') : t('admin.user.role.user')
                    }
                  />
                  {user.banned && user.banReason ? (
                    <DetailRow label={t('admin.user.field.banReason')} value={user.banReason} />
                  ) : null}
                  <DetailRow
                    label={t('admin.user.field.joinedAt')}
                    value={formatDate(user.createdAt)}
                    last
                  />
                </View>
              </View>

              {/* Actions card */}
              <View style={styles.card}>
                {!user.emailVerified && (
                  <ActionRow
                    icon={<CheckCircle color={Palette.success} size={20} />}
                    label={t('admin.user.actions.verifyEmail')}
                    loading={verifyEmail.isPending}
                    onPress={handleVerifyEmail}
                  />
                )}
                <ActionRow
                  danger={!user.banned}
                  icon={
                    user.banned ? (
                      <Shield color={Palette.success} size={20} />
                    ) : (
                      <ShieldOff color={Palette.danger} size={20} />
                    )
                  }
                  label={
                    user.banned ? t('admin.user.actions.unban') : t('admin.user.actions.ban.button')
                  }
                  last={revokeSessions.isPending === false && user.emailVerified}
                  loading={banMutation.isPending || unbanMutation.isPending}
                  onPress={user.banned ? handleUnban : handleBan}
                />
                <ActionRow
                  icon={<LogOut color={Palette.warning} size={20} />}
                  label={t('admin.user.actions.revokeSessions.button')}
                  last
                  loading={revokeSessions.isPending}
                  onPress={handleRevokeSessions}
                  warning
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

type ActionRowProps = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  loading?: boolean;
  last?: boolean;
  danger?: boolean;
  warning?: boolean;
};

function ActionRow({ icon, label, onPress, loading, last, danger, warning }: ActionRowProps) {
  return (
    <Pressable
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        !last && styles.actionRowBorder,
        pressed && !loading && styles.actionRowPressed,
        loading && styles.actionRowLoading,
      ]}
    >
      <View style={styles.actionRowIcon}>{icon}</View>
      <Text
        style={[
          styles.actionRowLabel,
          danger && styles.actionLabelDanger,
          warning && styles.actionLabelWarning,
        ]}
      >
        {label}
      </Text>
      {loading ? (
        <ActivityIndicator
          color={danger ? Palette.danger : warning ? Palette.warning : Palette.primary}
          size="small"
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 48,
  },
  content: {
    width: '100%',
    maxWidth: 820,
    gap: Spacing.lg,
  },
  center: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  avatarCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg + 2,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.cardSoft,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Palette.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Palette.primary,
    fontWeight: '700',
    fontSize: 30,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    color: Palette.text,
    fontSize: 22,
    fontWeight: '700',
  },
  userEmail: {
    color: Palette.textSecondary,
    fontSize: 15,
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    width: '100%',
  },
  editNameInput: {
    flex: 1,
    fontSize: 16,
    color: Palette.text,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: Palette.backgroundMuted,
  },
  editNameBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radii.md,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editNameBtnSave: {
    backgroundColor: Palette.primary,
  },
  editNameBtnCancel: {
    backgroundColor: Palette.backgroundMuted,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  editNameBtnPressed: {
    opacity: 0.8,
  },
  editNameBtnTextSave: {
    color: Palette.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  editNameBtnTextCancel: {
    color: Palette.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    justifyContent: 'center',
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  badgeSuccess: { backgroundColor: Palette.successSurface, borderColor: Palette.success },
  badgeWarning: { backgroundColor: Palette.warningSurface, borderColor: Palette.warning },
  badgeDanger: { backgroundColor: Palette.dangerSurface, borderColor: Palette.danger },
  badgePrimary: { backgroundColor: Palette.primarySurface, borderColor: Palette.primary },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  badgeTextSuccess: { color: Palette.success },
  badgeTextWarning: { color: Palette.warning },
  badgeTextDanger: { color: Palette.danger },
  badgeTextPrimary: { color: Palette.primary },
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg + 2,
    borderWidth: 1,
    borderColor: Palette.border,
    overflow: 'hidden',
    ...Shadow.cardSoft,
  },
  fieldsContainer: {
    padding: Spacing.lg,
    gap: 10,
  },
  fieldRow: {
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
    paddingBottom: 9,
  },
  fieldRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  fieldLabel: {
    color: Palette.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldValue: {
    color: Palette.text,
    fontSize: 16,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
    gap: Spacing.md,
    minHeight: 52,
  },
  actionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  actionRowPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  actionRowLoading: {
    opacity: 0.6,
  },
  actionRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: Palette.text,
  },
  actionLabelDanger: { color: Palette.danger },
  actionLabelWarning: { color: Palette.warning },
  errorText: {
    color: Palette.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
});
