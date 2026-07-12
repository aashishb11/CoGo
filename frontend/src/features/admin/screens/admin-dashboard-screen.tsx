import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { MembersTab } from '../components/members-tab';
import { OrgsTab } from '../components/orgs-tab';

import { useRequireAuth } from '@/features/auth/queries';
import { AdminIncidentsTab } from '@/features/incidents/components/admin-incidents-tab';
import { FlaggedRidesTab } from '@/features/incidents/components/flagged-rides-tab';
import { popOrReplace } from '@/shared/navigation/back';
import { Palette, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { SegmentedControl } from '@/shared/ui/components/segmented-control';

type AdminTab = 'orgs' | 'members' | 'flaggedRides' | 'incidents';

export default function AdminDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = useState<AdminTab>('orgs');
  const session = useRequireAuth();

  function handleBackToApp() {
    popOrReplace(router, '/(tabs)/profile' as never);
  }
  const sessionUser = session.data?.user ?? null;
  const sessionRole = (sessionUser as { role?: string | null } | null)?.role ?? null;

  if (session.isPending) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={Palette.primary} size="small" />
      </View>
    );
  }

  if (!sessionUser) {
    return null;
  }

  if (sessionRole !== 'admin') {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{
          onPress: handleBackToApp,
          accessibilityLabel: t('admin.dashboard.backToApp'),
        }}
        subtitle={t('admin.dashboard.subtitle')}
        title={t('admin.dashboard.title')}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <SegmentedControl<AdminTab>
            onChange={setTab}
            options={[
              { value: 'orgs', label: t('admin.dashboard.tabs.orgs') },
              { value: 'members', label: t('admin.dashboard.tabs.members') },
              { value: 'flaggedRides', label: t('admin.dashboard.tabs.flaggedRides') },
              { value: 'incidents', label: t('admin.dashboard.tabs.incidents') },
            ]}
            value={tab}
          />

          {tab === 'orgs' ? (
            <OrgsTab />
          ) : tab === 'members' ? (
            <MembersTab />
          ) : tab === 'flaggedRides' ? (
            <FlaggedRidesTab enabled={tab === 'flaggedRides'} />
          ) : (
            <AdminIncidentsTab enabled={tab === 'incidents'} />
          )}
        </View>
      </ScrollView>
    </View>
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
    paddingBottom: 36,
  },
  content: {
    width: '100%',
    maxWidth: 820,
    gap: Spacing.lg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
