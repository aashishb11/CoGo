import { useRouter } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { useMyIncidents } from '@/features/safety/queries';
import type { IncidentCategory } from '@/features/safety/schemas';
import { mapErrorToMessageKey } from '@/shared/api';
import { type TextKey } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

const CATEGORY_KEY: Record<IncidentCategory, TextKey> = {
  harassment: 'safety.incidents.category.harassment',
  unsafe_driving: 'safety.incidents.category.unsafe_driving',
  accident: 'safety.incidents.category.accident',
  other: 'safety.incidents.category.other',
};

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function MyIncidentsScreen() {
  useRequireAuth();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const incidentsQuery = useMyIncidents();
  const items = incidentsQuery.data ?? [];

  const errorMessage = incidentsQuery.error ? t(mapErrorToMessageKey(incidentsQuery.error)) : '';

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/profile');
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack }}
        subtitle={t('safety.incidents.subtitle')}
        title={t('safety.incidents.title')}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={() => {
              void incidentsQuery.refetch();
            }}
            refreshing={incidentsQuery.isRefetching}
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {incidentsQuery.isLoading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={Palette.primary} size="small" />
            <Text style={styles.statusText}>{t('safety.incidents.loading')}</Text>
          </View>
        ) : null}

        {!incidentsQuery.isLoading && errorMessage ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {!incidentsQuery.isLoading && !errorMessage && items.length === 0 ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{t('safety.incidents.empty')}</Text>
          </View>
        ) : null}

        {items.map((incident) => (
          <View key={incident.id} style={styles.row}>
            <View style={styles.rowIcon}>
              <ShieldAlert color={Palette.danger} size={18} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t(CATEGORY_KEY[incident.category])}</Text>
              <Text style={styles.rowMeta}>{formatDate(incident.createdAt, i18n.language)}</Text>
              {incident.note ? (
                <Text style={styles.rowNote} numberOfLines={3}>
                  {incident.note}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
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
    padding: Spacing.lg,
    gap: Spacing.sm,
    paddingBottom: 48,
  },
  statusCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.cardSoft,
  },
  errorCard: {
    backgroundColor: Palette.dangerSurface,
  },
  statusText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.cardSoft,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.pill,
    backgroundColor: Palette.dangerSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  rowMeta: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  rowNote: {
    color: Palette.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginTop: Spacing.xs,
  },
});
