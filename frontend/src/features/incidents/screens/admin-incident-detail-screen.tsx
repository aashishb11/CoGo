import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Calendar, Car, Mail, User } from 'lucide-react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { useAdminIncident } from '@/features/incidents/queries';
import type { IncidentCategory } from '@/features/incidents/types';
import { mapErrorToMessageKey } from '@/shared/api';
import { type Lang, toLang, type TextKey } from '@/shared/i18n';
import { popOrReplace } from '@/shared/navigation/back';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

const CATEGORY_LABEL_KEY: Record<IncidentCategory, TextKey> = {
  harassment: 'incidents.category.harassment',
  unsafe_driving: 'incidents.category.unsafe_driving',
  accident: 'incidents.category.accident',
  other: 'incidents.category.other',
};

function formatLongDateTime(value: string, lang: Lang) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat(lang, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(parsed));
}

export default function AdminIncidentDetailScreen() {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage ?? i18n.language) ?? 'es') as Lang;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const incidentId = typeof id === 'string' ? id.trim() : '';

  const session = useRequireAuth();
  const sessionUser = session.data?.user ?? null;
  const sessionRole = (sessionUser as { role?: string | null } | null)?.role ?? null;
  const isAdmin = sessionRole === 'admin';

  const incidentQuery = useAdminIncident(isAdmin && incidentId ? incidentId : null);
  const incident = incidentQuery.data ?? null;

  const handleBack = useCallback(() => {
    popOrReplace(router, '/admin' as never);
  }, [router]);

  const handleOpenRide = useCallback(() => {
    if (!incident) return;
    router.push({
      pathname: '/trips/[id]' as never,
      params: {
        id: incident.ride.tripId,
        rideId: incident.ride.id,
        rideRole: incident.reporter.role,
        from: 'admin-incident',
      },
    });
  }, [router, incident]);

  const handleOpenReporter = useCallback(() => {
    if (!incident) return;
    router.push({
      pathname: '/admin/[id]' as never,
      params: { id: incident.reporter.id },
    });
  }, [router, incident]);

  if (session.isPending) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={Palette.primary} size="small" />
      </View>
    );
  }

  if (!sessionUser) return null;

  if (!isAdmin) {
    return <Redirect href="/(tabs)" />;
  }

  const errorMessage =
    incidentQuery.error && !incidentQuery.isRefetching
      ? t(mapErrorToMessageKey(incidentQuery.error))
      : '';
  const isLoading = incidentQuery.isLoading;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack, accessibilityLabel: t('viewProfile.back') }}
        title={t('incidents.admin.detail.title')}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.statusCard}>
              <ActivityIndicator color={Palette.primary} size="small" />
            </View>
          ) : errorMessage ? (
            <View style={[styles.statusCard, styles.errorCard]}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : !incident ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusText}>{t('incidents.admin.detail.notFound')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroIconCircle}>
                  <AlertTriangle color={Palette.danger} size={26} strokeWidth={2.25} />
                </View>
                <Text style={styles.heroLabel}>{t('incidents.detail.categoryLabel')}</Text>
                <Text style={styles.heroValue}>{t(CATEGORY_LABEL_KEY[incident.category])}</Text>
                <View style={styles.heroMeta}>
                  <Calendar color={Palette.textSecondary} size={14} />
                  <Text style={styles.heroMetaText}>
                    {formatLongDateTime(incident.createdAt, lang)}
                  </Text>
                </View>
              </View>

              {incident.note ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t('incidents.detail.noteLabel')}</Text>
                  <View style={styles.noteCard}>
                    <Text style={styles.noteText}>{incident.note}</Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t('incidents.admin.detail.reporter')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenReporter}
                  style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                >
                  <View style={styles.linkRowIcon}>
                    <User color={Palette.primary} size={18} />
                  </View>
                  <View style={styles.linkRowBody}>
                    <Text style={styles.linkRowText}>{incident.reporter.name}</Text>
                    <View style={styles.linkRowSubRow}>
                      <Mail color={Palette.textSecondary} size={12} />
                      <Text style={styles.linkRowSubText} numberOfLines={1}>
                        {incident.reporter.email}
                      </Text>
                    </View>
                    <Text style={styles.linkRowSubText}>
                      {incident.reporter.role === 'driver'
                        ? t('incidents.admin.detail.reporterAsDriver')
                        : t('incidents.admin.detail.reporterAsPassenger')}
                    </Text>
                  </View>
                </Pressable>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t('incidents.admin.detail.ride')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenRide}
                  style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                >
                  <View style={styles.linkRowIcon}>
                    <Car color={Palette.primary} size={18} />
                  </View>
                  <View style={styles.linkRowBody}>
                    <Text style={styles.linkRowText} numberOfLines={1}>
                      {`${incident.ride.originLabel} → ${incident.ride.destinationLabel}`}
                    </Text>
                    <Text style={styles.linkRowSubText}>
                      {formatLongDateTime(incident.ride.scheduledDeparture, lang)}
                    </Text>
                    <Text style={styles.linkRowSubText}>
                      {t('incidents.admin.detail.driverLabel', {
                        name: incident.ride.driverName,
                      })}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </>
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
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 48,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    gap: Spacing.lg,
  },
  heroCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    ...Shadow.cardSoft,
  },
  heroIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Palette.dangerSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  heroLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroValue: {
    color: Palette.text,
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  heroMetaText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.xs,
  },
  noteCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.cardSoft,
  },
  noteText: {
    color: Palette.text,
    fontSize: FontSize.md,
    lineHeight: 21,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.cardSoft,
  },
  linkRowPressed: {
    opacity: 0.85,
  },
  linkRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkRowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  linkRowText: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  linkRowSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkRowSubText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  statusCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.cardSoft,
  },
  errorCard: {
    borderColor: Palette.danger,
    backgroundColor: Palette.dangerSurface,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  statusText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
});
