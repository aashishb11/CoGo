import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, Repeat } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormState, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { LocationSection } from '@/features/trips/create-trip/location-section';
import { PreferencesSection } from '@/features/trips/create-trip/preferences-section';
import { type TripMode } from '@/features/trips/create-trip/schedule-section';
import { createTripStyles as styles } from '@/features/trips/create-trip/styles';
import { VehicleSection } from '@/features/trips/create-trip/vehicle-section';
import { useEditTrip } from '@/features/trips/edit-trip/use-edit-trip';
import { mapErrorToMessageKey } from '@/shared/api';
import { env } from '@/shared/env';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { Toast, type ToastKind } from '@/shared/ui/components/toast';

const GOOGLE_PLACES_API_KEY = env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type ToastState = { kind: ToastKind; message: string } | null;

function normalizeId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return (value[0] ?? '').trim();
  if (typeof value === 'string') return value.trim();
  return '';
}

export default function EditTripScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const tripId = normalizeId(rawId);

  const session = useRequireAuth();

  const goToMyTrips = useCallback(() => {
    router.replace({ pathname: '/trips/my-trips' });
  }, [router]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    goToMyTrips();
  }, [goToMyTrips, router]);

  const {
    form,
    tripQuery,
    vehicleOptions,
    updateTripPending,
    updateTripError,
    updateTripIsSuccess,
    originLocation,
    destinationLocation,
    applyPlaceSelection,
    clearPlaceSelection,
    onSubmit,
  } = useEditTrip(tripId || null);

  const { errors: fieldErrors, submitCount } = useFormState({ control: form.control });
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  const tripMode = useWatch({ control: form.control, name: 'mode' }) as TripMode;

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const [toast, setToast] = useState<ToastState>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!updateTripIsSuccess) return;
    setToast({ kind: 'success', message: t('editTrip.feedback.success') });
    const timeoutId = setTimeout(() => goToMyTrips(), 600);
    return () => clearTimeout(timeoutId);
  }, [updateTripIsSuccess, t, goToMyTrips]);

  useEffect(() => {
    if (!updateTripError) return;
    setToast({ kind: 'error', message: t(mapErrorToMessageKey(updateTripError)) });
    scrollToTop();
  }, [updateTripError, scrollToTop, t]);

  useEffect(() => {
    if (submitCount === 0) return;
    if (!hasFieldErrors) return;
    setToast({ kind: 'error', message: t('editTrip.feedback.validation') });
    scrollToTop();
  }, [submitCount, hasFieldErrors, scrollToTop, t]);

  const isLoading = session.isPending || tripQuery.isLoading;
  const queryError = tripQuery.error;
  const tripMissing = !isLoading && !queryError && !tripQuery.data;

  return (
    <>
      <View style={styles.screen}>
        <ScreenHeader
          back={{ onPress: handleBack, accessibilityLabel: t('editTrip.back') }}
          subtitle={t('editTrip.screenSubtitle')}
          title={t('editTrip.screenTitle')}
        />
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ref={scrollViewRef}
        >
          {isLoading ? (
            <View style={[styles.card, compact && styles.cardCompact, localStyles.statusCard]}>
              <ActivityIndicator color={Palette.primary} size="small" />
              <Text style={localStyles.statusText}>{t('editTrip.loading')}</Text>
            </View>
          ) : null}

          {!isLoading && queryError ? (
            <View style={[styles.card, compact && styles.cardCompact, localStyles.statusCard]}>
              <Text style={localStyles.errorText}>{t(mapErrorToMessageKey(queryError))}</Text>
            </View>
          ) : null}

          {tripMissing ? (
            <View style={[styles.card, compact && styles.cardCompact, localStyles.statusCard]}>
              <Text style={localStyles.statusText}>{t('editTrip.notFound')}</Text>
            </View>
          ) : null}

          {!isLoading && !queryError && tripQuery.data ? (
            <>
              <View style={localStyles.tripTypeChip}>
                {tripMode === 'recurring' ? (
                  <Repeat color={Palette.primaryDark} size={14} />
                ) : (
                  <Calendar color={Palette.primaryDark} size={14} />
                )}
                <Text style={localStyles.tripTypeChipText}>
                  {tripMode === 'recurring'
                    ? t('editTrip.tripTypeChip.recurring')
                    : t('editTrip.tripTypeChip.sporadic')}
                </Text>
              </View>

              <LocationSection
                apiKey={GOOGLE_PLACES_API_KEY}
                control={form.control}
                destinationLocation={destinationLocation}
                onClearDestinationPlace={() => clearPlaceSelection('destination')}
                onClearOriginPlace={() => clearPlaceSelection('origin')}
                onSelectDestinationPlace={(place) => applyPlaceSelection('destination', place)}
                onSelectOriginPlace={(place) => applyPlaceSelection('origin', place)}
                originLocation={originLocation}
              />

              <VehicleSection control={form.control} options={vehicleOptions} />

              <PreferencesSection control={form.control} />

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: updateTripPending, disabled: updateTripPending }}
                disabled={updateTripPending}
                onPress={() => {
                  void onSubmit();
                }}
                style={({ pressed }) => [
                  styles.submitButton,
                  pressed && !updateTripPending && styles.submitButtonPressed,
                  updateTripPending && styles.submitButtonDisabled,
                ]}
              >
                {updateTripPending ? (
                  <View style={styles.submitButtonContent}>
                    <ActivityIndicator color={Palette.textOnPrimary} size="small" />
                    <Text style={styles.submitButtonText}>{t('editTrip.submitting')}</Text>
                  </View>
                ) : (
                  <Text style={styles.submitButtonText}>{t('editTrip.button')}</Text>
                )}
              </Pressable>
            </>
          ) : null}
        </ScrollView>

        <Toast
          kind={toast?.kind ?? 'success'}
          message={toast?.message ?? ''}
          onDismiss={dismissToast}
          visible={toast !== null}
        />
      </View>
    </>
  );
}

const localStyles = StyleSheet.create({
  statusCard: {
    alignItems: 'center',
    gap: Spacing.sm,
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
  tripTypeChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    backgroundColor: Palette.primarySurface,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    marginBottom: Spacing.sm,
  },
  tripTypeChipText: {
    color: Palette.primaryDark,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
