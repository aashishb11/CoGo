import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import type { BookingResponse } from '@/features/bookings/api';
import { useRideBookings } from '@/features/bookings/queries';
import { useProfile } from '@/features/profile/queries';
import type { UnscannedOutcome } from '@/features/trips/api';
import { useCompleteRideInstance } from '@/features/trips/queries';
import { formatCents } from '@/features/wallet/format';
import { mapErrorToMessageKey } from '@/shared/api';
import { toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { Toast, type ToastKind } from '@/shared/ui/components/toast';

type ToastState = { kind: ToastKind; message: string } | null;

type UnscannedChoice = 'boarded' | 'refund';

function isScanned(booking: BookingResponse): boolean {
  return Boolean(booking.boardedAt);
}

function BookingPassengerName({ passengerId }: { passengerId: string }) {
  const profileQuery = useProfile(passengerId);
  const username =
    typeof profileQuery.data?.username === 'string' && profileQuery.data.username.trim().length > 0
      ? profileQuery.data.username.trim()
      : null;
  return <Text style={styles.bookingPrimary}>{username ?? passengerId}</Text>;
}

function isAccepted(booking: BookingResponse): boolean {
  return booking.status === 'accepted';
}

// Backend default: post-departure → capture (no-show); pre-departure → refund.
function defaultUnscannedOutcome(scheduledDeparture: string): UnscannedChoice {
  const departure = new Date(scheduledDeparture).getTime();
  if (!Number.isFinite(departure)) return 'refund';
  return Date.now() >= departure ? 'boarded' : 'refund';
}

export default function CompleteRideScreen() {
  useRequireAuth();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const lang = toLang(i18n.resolvedLanguage ?? i18n.language) ?? 'en';

  const params = useLocalSearchParams<{ rideId?: string }>();
  const rideId = (params.rideId ?? '').trim();

  const bookingsQuery = useRideBookings(rideId);
  const completeRide = useCompleteRideInstance();

  const [outcomes, setOutcomes] = useState<Record<string, UnscannedChoice>>({});
  const [toast, setToast] = useState<ToastState>(null);
  const dismissToast = () => setToast(null);

  const acceptedBookings = useMemo(
    () => (bookingsQuery.data ?? []).filter(isAccepted),
    [bookingsQuery.data],
  );

  const scanned = useMemo(() => acceptedBookings.filter(isScanned), [acceptedBookings]);
  const unscanned = useMemo(
    () => acceptedBookings.filter((booking) => !isScanned(booking)),
    [acceptedBookings],
  );

  function getOutcome(booking: BookingResponse): UnscannedChoice {
    return outcomes[booking.id] ?? defaultUnscannedOutcome(booking.scheduledDeparture);
  }

  function setOutcome(bookingId: string, choice: UnscannedChoice) {
    setOutcomes((prev) => ({ ...prev, [bookingId]: choice }));
  }

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/agenda');
    }
  }

  async function handleSubmit() {
    if (!rideId) return;

    const payload: UnscannedOutcome[] = unscanned.map((booking) => ({
      bookingId: booking.id,
      outcome: getOutcome(booking),
    }));

    try {
      await completeRide.mutateAsync({
        rideId,
        unscannedOutcomes: payload.length > 0 ? payload : undefined,
      });
      setToast({ kind: 'success', message: t('rideLifecycle.completeRide.feedback.success') });
      router.replace('/(tabs)/agenda');
    } catch (error) {
      setToast({ kind: 'error', message: t(mapErrorToMessageKey(error)) });
    }
  }

  const isLoading = bookingsQuery.isLoading;
  const loadError = bookingsQuery.error;
  const isSubmitting = completeRide.isPending;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack }}
        subtitle={t('rideLifecycle.completeRide.subtitle')}
        title={t('rideLifecycle.completeRide.title')}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={Palette.primary} size="small" />
            <Text style={styles.statusText}>{t('rideLifecycle.completeRide.loading')}</Text>
          </View>
        ) : null}

        {!isLoading && loadError ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{t('rideLifecycle.completeRide.error.load')}</Text>
          </View>
        ) : null}

        {!isLoading && !loadError && acceptedBookings.length === 0 ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{t('rideLifecycle.completeRide.empty')}</Text>
          </View>
        ) : null}

        {scanned.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('rideLifecycle.completeRide.sectionScanned')}
            </Text>
            <Text style={styles.sectionHint}>
              {t('rideLifecycle.completeRide.sectionScannedHint')}
            </Text>
            <View style={styles.list}>
              {scanned.map((booking) => (
                <View key={booking.id} style={styles.bookingRow}>
                  <View style={styles.bookingHeaderRow}>
                    <BookingPassengerName passengerId={booking.passengerId} />
                    <CheckCircle2 color={Palette.primary} size={18} />
                  </View>
                  {typeof booking.fareCents === 'number' ? (
                    <Text style={styles.bookingSecondary}>
                      {formatCents(booking.fareCents, lang)}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {unscanned.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('rideLifecycle.completeRide.sectionUnscanned')}
            </Text>
            <Text style={styles.sectionHint}>
              {t('rideLifecycle.completeRide.sectionUnscannedHint')}
            </Text>
            <View style={styles.list}>
              {unscanned.map((booking) => {
                const choice = getOutcome(booking);
                return (
                  <View key={booking.id} style={styles.bookingRow}>
                    <View style={styles.bookingHeaderRow}>
                      <BookingPassengerName passengerId={booking.passengerId} />
                    </View>
                    <View style={styles.choiceRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: choice === 'boarded' }}
                        onPress={() => setOutcome(booking.id, 'boarded')}
                        style={({ pressed }) => [
                          styles.choice,
                          choice === 'boarded' && styles.choiceActive,
                          pressed && styles.choicePressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            choice === 'boarded' && styles.choiceTextActive,
                          ]}
                        >
                          {t('rideLifecycle.completeRide.outcome.boarded')}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: choice === 'refund' }}
                        onPress={() => setOutcome(booking.id, 'refund')}
                        style={({ pressed }) => [
                          styles.choice,
                          choice === 'refund' && styles.choiceActive,
                          pressed && styles.choicePressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            choice === 'refund' && styles.choiceTextActive,
                          ]}
                        >
                          {t('rideLifecycle.completeRide.outcome.refund')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting || isLoading || acceptedBookings.length === 0}
          onPress={() => {
            void handleSubmit();
          }}
          style={({ pressed }) => [
            formStyles.primaryButton,
            styles.submit,
            pressed && !isSubmitting && formStyles.primaryButtonPressed,
            (isSubmitting || isLoading || acceptedBookings.length === 0) &&
              formStyles.primaryButtonDisabled,
          ]}
        >
          {isSubmitting ? (
            <View style={formStyles.loadingRow}>
              <ActivityIndicator color={Palette.textOnPrimary} size="small" />
              <Text style={formStyles.primaryButtonText}>
                {t('rideLifecycle.completeRide.submitting')}
              </Text>
            </View>
          ) : (
            <Text style={formStyles.primaryButtonText}>
              {t('rideLifecycle.completeRide.submit')}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      <Toast
        kind={toast?.kind ?? 'error'}
        message={toast?.message ?? ''}
        onDismiss={dismissToast}
        visible={toast !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: 64,
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
  statusText: {
    ...Typography.body,
    color: Palette.textSecondary,
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: Palette.dangerSurface,
  },
  errorText: {
    ...Typography.body,
    color: Palette.danger,
    textAlign: 'center',
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.title,
    color: Palette.text,
  },
  sectionHint: {
    ...Typography.bodySmall,
    color: Palette.textSecondary,
  },
  list: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  bookingRow: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  bookingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookingPrimary: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  bookingSecondary: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  choice: {
    flex: 1,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  choiceActive: {
    borderColor: Palette.primary,
    backgroundColor: Palette.primarySurface,
  },
  choicePressed: {
    opacity: 0.85,
  },
  choiceText: {
    color: Palette.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  choiceTextActive: {
    color: Palette.primaryDark,
  },
  submit: {
    marginTop: Spacing.md,
  },
});
