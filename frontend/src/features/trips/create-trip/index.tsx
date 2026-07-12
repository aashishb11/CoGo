import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, Repeat, ShieldCheck, Ticket, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type FieldErrors, useFormState, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FareSection } from './fare-section';
import { LocationSection } from './location-section';
import { PreferencesSection } from './preferences-section';
import { ScheduleSection, type TripMode } from './schedule-section';
import { createTripStyles as styles } from './styles';
import { type CreateTripFormValues, useCreateTrip } from './use-create-trip';
import { VehicleSection } from './vehicle-section';

import { TrustedContactSheet } from '@/features/profile/components/trusted-contact-sheet';
import { useTrustedContact } from '@/features/profile/queries';
import { getErrorCode, mapErrorToMessageKey } from '@/shared/api';
import { env } from '@/shared/env';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';
import { BrandLogo } from '@/shared/ui/components/brand-logo';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { SegmentedControl } from '@/shared/ui/components/segmented-control';
import { Toast, type ToastKind } from '@/shared/ui/components/toast';

function readParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').trim();
}

function parseCoord(value: string | string[] | undefined): number | null {
  const raw = readParam(value);
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

const GOOGLE_PLACES_API_KEY = env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type ToastState = { kind: ToastKind; message: string } | null;

function getValidationMessageKey(errors: FieldErrors<CreateTripFormValues>) {
  if (errors.origin || errors.destination) {
    return 'createTrip.feedback.validationRoute';
  }
  if (errors.days || errors.date || errors.startDate || errors.endDate || errors.time) {
    return 'createTrip.feedback.validationSchedule';
  }
  if (errors.pricePerSeatEuros) {
    return 'createTrip.feedback.validationFare';
  }
  if (errors.vehicle) {
    return 'createTrip.feedback.validationVehicle';
  }
  return 'createTrip.feedback.validation';
}

export default function CreateTripScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const {
    form,
    vehicleOptions,
    createTripPending,
    createTripError,
    createTripIsSuccess,
    resetCreateTripError,
    originLocation,
    destinationLocation,
    applyPlaceSelection,
    clearPlaceSelection,
    setEventId,
    onSubmit,
  } = useCreateTrip();
  const trustedContactQuery = useTrustedContact();

  const { errors: fieldErrors, submitCount } = useFormState({ control: form.control });
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  const tripMode = useWatch({ control: form.control, name: 'mode' }) as TripMode;
  const setTripMode = (next: TripMode) => form.setValue('mode', next, { shouldValidate: false });

  // Pre-fill destination + force sporadic mode when the user arrives from
  // "Offer a ride to this event" on the event-detail screen. The router params
  // persist on the tab until replaced; we apply them once per unique combo so
  // manual edits aren't reverted on every render.
  const eventParams = useLocalSearchParams<{
    eventId?: string | string[];
    eventTitle?: string | string[];
    eventLat?: string | string[];
    eventLng?: string | string[];
    eventLocation?: string | string[];
    eventStartDate?: string | string[];
    eventEndDate?: string | string[];
  }>();
  const lastAppliedEventKey = useRef<string>('');
  useEffect(() => {
    const eventLat = parseCoord(eventParams.eventLat);
    const eventLng = parseCoord(eventParams.eventLng);
    if (eventLat === null || eventLng === null) return;
    const eventLocation = readParam(eventParams.eventLocation);
    const eventTitle = readParam(eventParams.eventTitle);
    const eventId = readParam(eventParams.eventId);
    const key = `${eventId}|${eventLat}|${eventLng}`;
    if (lastAppliedEventKey.current === key) return;
    lastAppliedEventKey.current = key;
    form.setValue('mode', 'sporadic', { shouldValidate: false });
    applyPlaceSelection('destination', {
      latitude: eventLat,
      longitude: eventLng,
      address: eventLocation || eventTitle,
    });
    if (eventId) setEventId(eventId);
  }, [
    applyPlaceSelection,
    eventParams.eventId,
    eventParams.eventLat,
    eventParams.eventLng,
    eventParams.eventLocation,
    eventParams.eventTitle,
    form,
    setEventId,
  ]);

  // Derive event context for UI locking. A non-empty eventId with valid coords
  // means we arrived from "Offer a ride to this event".
  const hasEventContext =
    Boolean(readParam(eventParams.eventId)) &&
    parseCoord(eventParams.eventLat) !== null &&
    parseCoord(eventParams.eventLng) !== null;
  const eventDestinationLabel = hasEventContext
    ? readParam(eventParams.eventLocation) || readParam(eventParams.eventTitle)
    : undefined;
  const eventTitleLabel = hasEventContext
    ? readParam(eventParams.eventTitle) || readParam(eventParams.eventLocation)
    : undefined;
  const eventStartDateParam = hasEventContext ? readParam(eventParams.eventStartDate) : undefined;
  const eventEndDateParam = hasEventContext ? readParam(eventParams.eventEndDate) : undefined;

  const handleSwapEnds = useCallback(() => {
    const currentOrigin = form.getValues('origin');
    const currentDestination = form.getValues('destination');
    form.setValue('origin', currentDestination, { shouldValidate: false });
    form.setValue('destination', currentOrigin, { shouldValidate: false });
  }, [form]);

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const [toast, setToast] = useState<ToastState>(null);
  const [isTrustedContactSheetVisible, setIsTrustedContactSheetVisible] = useState(false);
  const dismissToast = useCallback(() => setToast(null), []);
  const isTrustedContactMissing =
    trustedContactQuery.isSuccess && trustedContactQuery.data === null;
  const shouldBlockForTrustedContact =
    trustedContactQuery.data === null ||
    (!trustedContactQuery.data && !trustedContactQuery.isLoading && !trustedContactQuery.isError);

  useEffect(() => {
    if (!createTripIsSuccess) return;
    setToast({ kind: 'success', message: t('createTrip.feedback.success') });
  }, [createTripIsSuccess, t]);

  useEffect(() => {
    if (!createTripError) return;
    if (getErrorCode(createTripError) === 'TRUSTED_CONTACT_REQUIRED') {
      setToast(null);
      setIsTrustedContactSheetVisible(true);
      return;
    }
    setToast({ kind: 'error', message: t(mapErrorToMessageKey(createTripError)) });
    scrollToTop();
  }, [createTripError, scrollToTop, t]);

  const handleTrustedContactSaved = useCallback(async () => {
    resetCreateTripError();
    await onSubmit();
  }, [onSubmit, resetCreateTripError]);

  const handleCreateTripPress = useCallback(async () => {
    if (shouldBlockForTrustedContact) {
      resetCreateTripError();
      setToast(null);
      setIsTrustedContactSheetVisible(true);
      return;
    }

    if (!trustedContactQuery.data && trustedContactQuery.isLoading) {
      const result = await trustedContactQuery.refetch();
      if (result.data === null) {
        resetCreateTripError();
        setToast(null);
        setIsTrustedContactSheetVisible(true);
        return;
      }
    }

    await onSubmit();
  }, [onSubmit, resetCreateTripError, shouldBlockForTrustedContact, trustedContactQuery]);

  useEffect(() => {
    if (submitCount === 0) return;
    if (!hasFieldErrors) return;
    setToast({ kind: 'error', message: t(getValidationMessageKey(fieldErrors)) });
    scrollToTop();
  }, [fieldErrors, submitCount, hasFieldErrors, scrollToTop, t]);

  return (
    <>
      <View style={styles.screen}>
        <ScreenHeader
          rightAction={<BrandLogo accessibilityLabel={t('header.brand')} size="compact" />}
          title={t('header.createTitle')}
          subtitle={t('header.createSubtitle')}
        />
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ref={scrollViewRef}
        >
          <SegmentedControl<TripMode>
            onChange={setTripMode}
            options={[
              {
                value: 'recurring',
                label: t('createTrip.mode.recurring'),
                disabled: hasEventContext,
                icon: (
                  <Repeat
                    color={tripMode === 'recurring' ? Palette.primaryDark : Palette.textSecondary}
                    size={14}
                  />
                ),
              },
              {
                value: 'sporadic',
                label: t('createTrip.mode.sporadic'),
                icon: (
                  <Calendar
                    color={tripMode === 'sporadic' ? Palette.primaryDark : Palette.textSecondary}
                    size={14}
                  />
                ),
              },
            ]}
            value={tripMode}
          />

          {hasEventContext && eventTitleLabel ? (
            <View style={eventStyles.banner}>
              <Ticket color={Palette.primaryDark} size={14} />
              <Text numberOfLines={1} style={eventStyles.bannerLabel}>
                {t('createTrip.eventTripFor', { event: eventTitleLabel })}
              </Text>
              <Pressable
                accessibilityLabel={t('createTrip.eventTripClear')}
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => {
                  router.setParams({
                    eventId: '',
                    eventTitle: '',
                    eventLat: '',
                    eventLng: '',
                    eventLocation: '',
                    eventStartDate: '',
                    eventEndDate: '',
                  });
                  setEventId('');
                }}
                style={({ pressed }) => [
                  eventStyles.clearIcon,
                  pressed && eventStyles.clearIconPressed,
                ]}
              >
                <X color={Palette.primaryDark} size={16} strokeWidth={2.4} />
              </Pressable>
            </View>
          ) : null}

          {isTrustedContactMissing ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsTrustedContactSheetVisible(true)}
              style={({ pressed }) => [
                eventStyles.trustedContactNotice,
                pressed && eventStyles.noticePressed,
              ]}
            >
              <ShieldCheck color={Palette.primaryDark} size={16} strokeWidth={2.3} />
              <View style={eventStyles.noticeTextWrap}>
                <Text style={eventStyles.noticeTitle}>{t('error.trustedContactRequired')}</Text>
                <Text style={eventStyles.noticeSubtitle}>
                  {t('profile.trustedContact.emptySubtitle')}
                </Text>
              </View>
            </Pressable>
          ) : null}

          <LocationSection
            apiKey={GOOGLE_PLACES_API_KEY}
            control={form.control}
            destinationLocation={destinationLocation}
            lockedDestinationLabel={eventDestinationLabel}
            // The destination is locked when arriving from an event — don't
            // surface a clear affordance there since the user can't change it.
            onClearDestinationPlace={
              hasEventContext ? undefined : () => clearPlaceSelection('destination')
            }
            onClearOriginPlace={() => clearPlaceSelection('origin')}
            onSelectDestinationPlace={(place) => applyPlaceSelection('destination', place)}
            onSelectOriginPlace={(place) => applyPlaceSelection('origin', place)}
            onSwap={hasEventContext ? undefined : handleSwapEnds}
            originLocation={originLocation}
          />

          <ScheduleSection
            control={form.control}
            eventDateMax={eventEndDateParam || eventStartDateParam}
            eventDateMin={eventStartDateParam}
            mode={tripMode}
            setValue={form.setValue}
          />

          <FareSection control={form.control} />

          <VehicleSection control={form.control} options={vehicleOptions} />

          <PreferencesSection control={form.control} />

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: createTripPending, disabled: createTripPending }}
            disabled={createTripPending}
            onPress={() => {
              void handleCreateTripPress();
            }}
            style={({ pressed }) => [
              styles.submitButton,
              pressed && !createTripPending && styles.submitButtonPressed,
              createTripPending && styles.submitButtonDisabled,
            ]}
          >
            {createTripPending ? (
              <View style={styles.submitButtonContent}>
                <ActivityIndicator color={Palette.textOnPrimary} size="small" />
                <Text style={styles.submitButtonText}>{t('createTrip.submitting')}</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>{t('createTrip.button')}</Text>
            )}
          </Pressable>
        </ScrollView>

        <Toast
          kind={toast?.kind ?? 'success'}
          message={toast?.message ?? ''}
          onDismiss={dismissToast}
          visible={toast !== null}
        />
        <TrustedContactSheet
          contact={trustedContactQuery.data ?? null}
          onClose={() => setIsTrustedContactSheetVisible(false)}
          onSaved={handleTrustedContactSaved}
          visible={isTrustedContactSheetVisible}
        />
      </View>
    </>
  );
}

const eventStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    backgroundColor: Palette.primarySurface,
    borderRadius: 12,
  },
  bannerLabel: {
    color: Palette.primaryDark,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    flex: 1,
  },
  clearIcon: {
    padding: Spacing.xs,
    borderRadius: 999,
  },
  clearIconPressed: {
    backgroundColor: Palette.background,
  },
  trustedContactNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Palette.primarySurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.primary,
  },
  noticePressed: {
    opacity: 0.82,
  },
  noticeTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  noticeTitle: {
    color: Palette.primaryDark,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  noticeSubtitle: {
    color: Palette.primaryDark,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
});
