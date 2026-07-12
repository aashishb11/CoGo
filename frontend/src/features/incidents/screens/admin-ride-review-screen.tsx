import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, Car, CheckCircle2, ShieldAlert, ShieldOff } from 'lucide-react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAdminUser, useBanUser } from '@/features/admin/queries';
import { useRequireAuth } from '@/features/auth/queries';
import { IncidentRow } from '@/features/incidents/components/incident-row';
import { useResolveRideReview, useRideReview } from '@/features/incidents/queries';
import type { AdminIncidentListItemDto } from '@/features/incidents/types';
import { mapErrorToMessageKey } from '@/shared/api';
import { type Lang, toLang } from '@/shared/i18n';
import { popOrReplace } from '@/shared/navigation/back';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

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

function confirm(title: string, message: string, ctaLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: ctaLabel, onPress: onConfirm },
  ]);
}

export default function AdminRideReviewScreen() {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage ?? i18n.language) ?? 'es') as Lang;
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const normalizedRideId = typeof rideId === 'string' ? rideId.trim() : '';

  const session = useRequireAuth();
  const sessionUser = session.data?.user ?? null;
  const sessionRole = (sessionUser as { role?: string | null } | null)?.role ?? null;
  const isAdmin = sessionRole === 'admin';

  const reviewQuery = useRideReview(isAdmin && normalizedRideId ? normalizedRideId : null);
  const resolveMutation = useResolveRideReview();
  const banMutation = useBanUser();
  const review = reviewQuery.data ?? null;
  // Driver user is fetched lazily to know whether they are already banned —
  // we don't want to expose "Ban driver" once they're banned, and we want to
  // surface a clear banned badge instead.
  const driverUserQuery = useAdminUser(isAdmin ? (review?.ride.driverId ?? null) : null);
  const driverIsBanned = driverUserQuery.data?.banned === true;

  const handleBack = useCallback(() => {
    popOrReplace(router, '/admin' as never);
  }, [router]);

  const handleOpenDriver = useCallback(() => {
    if (!review) return;
    router.push({
      pathname: '/admin/[id]' as never,
      params: { id: review.ride.driverId },
    });
  }, [router, review]);

  const handleOpenIncident = useCallback(
    (incident: AdminIncidentListItemDto) => {
      router.push({
        pathname: '/admin/incidents/[id]' as never,
        params: { id: incident.id },
      });
    },
    [router],
  );

  const handleResolve = useCallback(() => {
    if (!review) return;
    confirm(
      t('admin.review.resolve.confirmTitle'),
      t('admin.review.resolve.confirmBody'),
      t('admin.review.resolve.cta'),
      () => {
        resolveMutation.mutate(review.ride.id, {
          onSuccess: () => {
            popOrReplace(router, '/admin' as never);
          },
        });
      },
    );
  }, [review, resolveMutation, router, t]);

  const handleBanDriver = useCallback(() => {
    if (!review) return;
    confirm(
      t('admin.review.ban.confirmTitle'),
      t('admin.review.ban.confirmBody', { name: review.ride.driverName }),
      t('admin.review.ban.cta'),
      () => {
        banMutation.mutate({ userId: review.ride.driverId });
      },
    );
  }, [review, banMutation, t]);

  if (session.isPending) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={Palette.primary} size="small" />
      </View>
    );
  }

  if (!sessionUser) return null;
  if (!isAdmin) return <Redirect href="/(tabs)" />;

  const errorMessage =
    reviewQuery.error && !reviewQuery.isRefetching
      ? t(mapErrorToMessageKey(reviewQuery.error))
      : '';
  const mutationError = resolveMutation.error ? t(mapErrorToMessageKey(resolveMutation.error)) : '';
  const banError = banMutation.error ? t(mapErrorToMessageKey(banMutation.error)) : '';
  const isLoading = reviewQuery.isLoading;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack, accessibilityLabel: t('viewProfile.back') }}
        title={t('admin.review.title')}
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
          ) : !review ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusText}>{t('admin.review.notFound')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroIconCircle}>
                  <ShieldAlert color={Palette.danger} size={26} strokeWidth={2.25} />
                </View>
                <Text style={styles.heroLabel}>{t('admin.review.routeLabel')}</Text>
                <Text style={styles.heroValue}>
                  {`${review.ride.originLabel} → ${review.ride.destinationLabel}`}
                </Text>
                <View style={styles.heroMeta}>
                  <Calendar color={Palette.textSecondary} size={14} />
                  <Text style={styles.heroMetaText}>
                    {formatLongDateTime(review.ride.scheduledDeparture, lang)}
                  </Text>
                </View>
                <View style={styles.statusPillRow}>
                  <View
                    style={[
                      styles.statusPill,
                      review.ride.flaggedForReview
                        ? styles.statusPillFlagged
                        : styles.statusPillResolved,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        review.ride.flaggedForReview
                          ? styles.statusPillTextFlagged
                          : styles.statusPillTextResolved,
                      ]}
                    >
                      {review.ride.flaggedForReview
                        ? t('admin.review.flaggedPill')
                        : t('admin.review.resolvedPill')}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t('admin.review.driver')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenDriver}
                  style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                >
                  <View style={styles.linkRowIcon}>
                    <Car color={Palette.primary} size={18} />
                  </View>
                  <View style={styles.linkRowBody}>
                    <View style={styles.linkRowNameRow}>
                      <Text style={styles.linkRowText} numberOfLines={1}>
                        {review.ride.driverName}
                      </Text>
                      {driverIsBanned ? (
                        <View style={styles.bannedBadge}>
                          <Text style={styles.bannedBadgeText}>
                            {t('admin.user.status.banned')}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.linkRowSubText}>{t('admin.review.openDriver')}</Text>
                  </View>
                </Pressable>
                {driverIsBanned ? null : (
                  <Pressable
                    accessibilityRole="button"
                    disabled={banMutation.isPending}
                    onPress={handleBanDriver}
                    style={({ pressed }) => [
                      styles.banButton,
                      pressed && styles.banButtonPressed,
                      banMutation.isPending && styles.banButtonDisabled,
                    ]}
                  >
                    {banMutation.isPending ? (
                      <ActivityIndicator color={Palette.danger} size="small" />
                    ) : (
                      <>
                        <ShieldOff color={Palette.danger} size={16} strokeWidth={2.25} />
                        <Text style={styles.banButtonText}>{t('admin.review.ban.cta')}</Text>
                      </>
                    )}
                  </Pressable>
                )}
                {banError ? <Text style={styles.mutationErrorText}>{banError}</Text> : null}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  {t('admin.review.incidentsCount', {
                    count: review.incidents.length,
                  })}
                </Text>
                {review.incidents.length === 0 ? (
                  <View style={styles.statusCard}>
                    <Text style={styles.statusText}>{t('admin.review.noIncidents')}</Text>
                  </View>
                ) : (
                  <View style={styles.list}>
                    {review.incidents.map((incident) => (
                      <IncidentRow
                        incident={incident}
                        key={incident.id}
                        onPress={() => handleOpenIncident(incident)}
                      />
                    ))}
                  </View>
                )}
              </View>

              {review.ride.flaggedForReview ? (
                <View style={styles.section}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={resolveMutation.isPending}
                    onPress={handleResolve}
                    style={({ pressed }) => [
                      styles.resolveButton,
                      pressed && styles.resolveButtonPressed,
                      resolveMutation.isPending && styles.resolveButtonDisabled,
                    ]}
                  >
                    {resolveMutation.isPending ? (
                      <ActivityIndicator color={Palette.card} size="small" />
                    ) : (
                      <>
                        <CheckCircle2 color={Palette.card} size={18} strokeWidth={2.25} />
                        <Text style={styles.resolveButtonText}>
                          {t('admin.review.resolve.cta')}
                        </Text>
                      </>
                    )}
                  </Pressable>
                  {mutationError ? (
                    <Text style={styles.mutationErrorText}>{mutationError}</Text>
                  ) : null}
                </View>
              ) : null}
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
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
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
  statusPillRow: {
    marginTop: Spacing.md,
  },
  statusPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radii.pill,
  },
  statusPillFlagged: {
    backgroundColor: Palette.dangerSurface,
  },
  statusPillResolved: {
    backgroundColor: Palette.successSurface,
  },
  statusPillText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statusPillTextFlagged: {
    color: Palette.danger,
  },
  statusPillTextResolved: {
    color: Palette.success,
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
  list: {
    gap: Spacing.sm,
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
    flexShrink: 1,
  },
  linkRowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bannedBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.danger,
    backgroundColor: Palette.dangerSurface,
  },
  bannedBadgeText: {
    color: Palette.danger,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  linkRowSubText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  resolveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
  },
  resolveButtonPressed: {
    opacity: 0.85,
  },
  resolveButtonDisabled: {
    opacity: 0.55,
  },
  resolveButtonText: {
    color: Palette.card,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  banButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.dangerSurface,
    borderWidth: 1,
    borderColor: Palette.danger,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
  },
  banButtonPressed: {
    opacity: 0.85,
  },
  banButtonDisabled: {
    opacity: 0.55,
  },
  banButtonText: {
    color: Palette.danger,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  mutationErrorText: {
    color: Palette.danger,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.xs,
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
