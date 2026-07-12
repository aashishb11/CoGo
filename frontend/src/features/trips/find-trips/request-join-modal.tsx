import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarDays, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';
import { z } from 'zod';

import { BookingRequestMessageSchema } from '@/features/bookings/schemas';
import { type RideItem } from '@/features/trips/api';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { BottomDrawer } from '@/shared/ui/components/bottom-drawer';

const MESSAGE_MAX_LENGTH = 500;

LocaleConfig.locales.en = {
  monthNames: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  monthNamesShort: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
  dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  today: 'Today',
};

LocaleConfig.locales.es = {
  monthNames: [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ],
  monthNamesShort: [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic',
  ],
  dayNames: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  dayNamesShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  today: 'Hoy',
};

LocaleConfig.locales.ca = {
  monthNames: [
    'Gener',
    'Febrer',
    'Març',
    'Abril',
    'Maig',
    'Juny',
    'Juliol',
    'Agost',
    'Setembre',
    'Octubre',
    'Novembre',
    'Desembre',
  ],
  monthNamesShort: [
    'Gen',
    'Feb',
    'Març',
    'Abr',
    'Maig',
    'Juny',
    'Jul',
    'Ago',
    'Set',
    'Oct',
    'Nov',
    'Des',
  ],
  dayNames: ['Diumenge', 'Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte'],
  dayNamesShort: ['Dg', 'Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds'],
  today: 'Avui',
};

type RequestJoinModalProps = {
  visible: boolean;
  rides: RideItem[];
  initialRide?: RideItem | null;
  tripType?: 'sporadic' | 'recurring' | null;
  initialRideId?: string | null;
  isLoadingRides?: boolean;
  isSubmitting: boolean;
  formError?: string;
  onClose: () => void;
  onSubmit: (input: { rideIds: string[]; message?: string }) => Promise<void> | void;
};

const LOCALE_MAP: Record<Lang, string> = {
  en: 'en-US',
  es: 'es-ES',
  ca: 'ca-ES',
};

const AVAILABLE_DAY_CONTAINER = {
  borderWidth: 1,
  borderColor: Palette.primary,
  backgroundColor: Palette.primarySurface,
};

const AVAILABLE_DAY_TEXT = {
  color: Palette.primaryDark,
  fontWeight: FontWeight.bold,
};

const SELECTED_DAY_CONTAINER = {
  backgroundColor: Palette.primary,
};

const SELECTED_DAY_TEXT = {
  color: Palette.textOnPrimary,
  fontWeight: FontWeight.bold,
};

function formatSelectedRideChip(value: string, lang: Lang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(LOCALE_MAP[lang], {
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    return value;
  }
}

function toCalendarDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sortRidesByDeparture(rides: RideItem[]) {
  return [...rides].sort((a, b) => {
    const aTime = new Date(a.scheduledDeparture).getTime();
    const bTime = new Date(b.scheduledDeparture).getTime();
    return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
  });
}

function getRideId(ride: RideItem) {
  const id = ride.id?.trim();
  if (id) return id;

  const legacyRideId = (ride as RideItem & { rideId?: unknown }).rideId;
  return typeof legacyRideId === 'string' ? legacyRideId.trim() : '';
}

function availableSeats(ride: RideItem) {
  return Math.max(0, ride.seatsOffered - ride.seatsOccupied);
}

export function RequestJoinModal({
  visible,
  rides,
  initialRide,
  tripType,
  initialRideId,
  isLoadingRides = false,
  isSubmitting,
  formError,
  onClose,
  onSubmit,
}: RequestJoinModalProps) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;
  const [selectedRideIds, setSelectedRideIds] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState('');
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [isCalendarMounted, setIsCalendarMounted] = useState(false);
  const calendarProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isCalendarVisible) {
      setIsCalendarMounted(true);
      Animated.timing(calendarProgress, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(calendarProgress, {
      toValue: 0,
      duration: 150,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setIsCalendarMounted(false);
    });
  }, [calendarProgress, isCalendarVisible]);

  const isSporadicTrip = tripType === 'sporadic';
  const ridesForSelection = useMemo(() => {
    if (!isSporadicTrip || !initialRide) return rides;
    const initialId = getRideId(initialRide);
    if (rides.some((ride) => getRideId(ride) === initialId)) return rides;
    return [...rides, initialRide];
  }, [initialRide, isSporadicTrip, rides]);
  const sortedRides = useMemo(() => sortRidesByDeparture(ridesForSelection), [ridesForSelection]);
  const todayCalendarDate = toCalendarDate(new Date().toISOString());
  const availableRideByDate = useMemo(() => {
    const map = new Map<string, RideItem[]>();
    for (const ride of sortedRides) {
      const seats = availableSeats(ride);
      const calendarDate = toCalendarDate(ride.scheduledDeparture);
      if (
        !calendarDate ||
        calendarDate < todayCalendarDate ||
        ride.status !== 'active' ||
        seats <= 0
      ) {
        continue;
      }

      const existing = map.get(calendarDate) ?? [];
      existing.push(ride);
      map.set(calendarDate, existing);
    }
    return map;
  }, [sortedRides, todayCalendarDate]);
  const availableRides = useMemo(
    () => Array.from(availableRideByDate.values()).flat(),
    [availableRideByDate],
  );
  const sporadicRideId = useMemo(() => {
    if (!isSporadicTrip) return '';

    const initialId = initialRide ? getRideId(initialRide) : '';
    if (initialId) return initialId;

    const selectedInitialRide = availableRides.find((ride) => getRideId(ride) === initialRideId);
    if (selectedInitialRide) return getRideId(selectedInitialRide);

    const fallbackRide = availableRides[0];
    return fallbackRide ? getRideId(fallbackRide) : '';
  }, [availableRides, initialRide, initialRideId, isSporadicTrip]);
  const selectedRides = useMemo(
    () => sortedRides.filter((ride) => selectedRideIds.includes(getRideId(ride))),
    [selectedRideIds, sortedRides],
  );
  const markedDates = useMemo(() => {
    const marks: Record<string, object> = {};
    for (const [date, dateRides] of availableRideByDate) {
      const selected = dateRides.some((ride) => selectedRideIds.includes(getRideId(ride)));
      marks[date] = {
        customStyles: {
          container: selected ? SELECTED_DAY_CONTAINER : AVAILABLE_DAY_CONTAINER,
          text: selected ? SELECTED_DAY_TEXT : AVAILABLE_DAY_TEXT,
        },
      };
    }
    return marks;
  }, [availableRideByDate, selectedRideIds]);
  const form = useForm<z.input<typeof BookingRequestMessageSchema>>({
    resolver: zodResolver(BookingRequestMessageSchema),
    defaultValues: { message: '' },
    mode: 'onSubmit',
  });
  const messageValue = form.watch('message') ?? '';

  useEffect(() => {
    LocaleConfig.defaultLocale = lang;
  }, [lang]);

  useEffect(() => {
    if (!visible) return;

    setSelectedRideIds([]);
    setSelectionError('');
    setIsCalendarVisible(false);
    form.reset({ message: '' });
  }, [form, visible]);

  useEffect(() => {
    if (!visible || isSporadicTrip || !initialRideId) return;

    const initialRide = sortedRides.find((ride) => getRideId(ride) === initialRideId);
    const initialDate = initialRide ? toCalendarDate(initialRide.scheduledDeparture) : '';
    const initialDateRides = initialDate ? availableRideByDate.get(initialDate) : undefined;
    if (!initialDateRides?.some((ride) => getRideId(ride) === initialRideId)) return;

    setSelectedRideIds((current) => (current.length > 0 ? current : [initialRideId]));
  }, [availableRideByDate, initialRideId, isSporadicTrip, sortedRides, visible]);

  useEffect(() => {
    if (!visible || !isSporadicTrip || availableRides.length === 0) return;

    const initialRide = availableRides.find((ride) => getRideId(ride) === initialRideId);
    const fallbackRide = availableRides[0];
    if (!fallbackRide) return;

    const rideToSelect = initialRide ?? fallbackRide;
    const rideToSelectId = getRideId(rideToSelect);
    if (!rideToSelectId) return;

    setSelectionError('');
    setSelectedRideIds([rideToSelectId]);
  }, [availableRides, initialRideId, isSporadicTrip, visible]);

  function toggleRidesForDate(date: string) {
    const dateRides = availableRideByDate.get(date) ?? [];
    if (dateRides.length === 0) return;

    setSelectionError('');
    const dateRideIds = dateRides.map(getRideId).filter(Boolean);
    if (dateRideIds.length === 0) return;

    setSelectedRideIds((current) =>
      dateRideIds.every((rideId) => current.includes(rideId))
        ? current.filter((selectedRideId) => !dateRideIds.includes(selectedRideId))
        : Array.from(new Set([...current, ...dateRideIds])),
    );
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    const rideIds = isSporadicTrip && sporadicRideId ? [sporadicRideId] : selectedRideIds;

    if (rideIds.length === 0) {
      setSelectionError(t('joinTrip.validation.selectAtLeastOne'));
      return;
    }

    try {
      await onSubmit({
        rideIds,
        message: values.message?.trim() || undefined,
      });
    } catch {
      // Parent mutations surface the API error through formError.
    }
  });

  return (
    <BottomDrawer drawerStyle={styles.sheet} onClose={onClose} visible={visible}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{t('joinTrip.modal.title')}</Text>
          <Text style={styles.subtitle}>{t('joinTrip.modal.subtitle')}</Text>
        </View>
        <Pressable
          accessibilityLabel={t('common.action.close')}
          accessibilityRole="button"
          disabled={isSubmitting}
          hitSlop={10}
          onPress={onClose}
          style={styles.closeButton}
        >
          <X color={Palette.textSecondary} size={20} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('joinTrip.modal.availableDates')}</Text>
          {isLoadingRides ? (
            <View style={styles.loadingRidesRow}>
              <ActivityIndicator color={Palette.primary} size="small" />
              <Text style={styles.emptyText}>{t('joinTrip.modal.loadingDates')}</Text>
            </View>
          ) : availableRideByDate.size === 0 ? (
            <Text style={styles.emptyText}>{t('joinTrip.modal.emptyDates')}</Text>
          ) : isSporadicTrip ? (
            <View style={styles.datePickerButton}>
              <View style={styles.datePickerIcon}>
                <CalendarDays color={Palette.primary} size={20} strokeWidth={2.3} />
              </View>
              <View style={styles.datePickerTextWrap}>
                <Text style={styles.datePickerTitle}>{t('joinTrip.modal.selectedDates')}</Text>
                <Text style={styles.datePickerSubtitle}>
                  {selectedRides[0]
                    ? formatSelectedRideChip(selectedRides[0].scheduledDeparture, lang)
                    : t('joinTrip.modal.noSelectedDates')}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsCalendarVisible(true)}
                style={({ pressed }) => [styles.datePickerButton, pressed && styles.pressed]}
              >
                <View style={styles.datePickerIcon}>
                  <CalendarDays color={Palette.primary} size={20} strokeWidth={2.3} />
                </View>
                <View style={styles.datePickerTextWrap}>
                  <Text style={styles.datePickerTitle}>{t('joinTrip.modal.openCalendar')}</Text>
                  <Text style={styles.datePickerSubtitle}>
                    {selectedRides.length > 0
                      ? t('joinTrip.modal.selectedCount', { count: selectedRides.length })
                      : t('joinTrip.modal.noSelectedDates')}
                  </Text>
                </View>
              </Pressable>

              <View style={styles.selectedSection}>
                <Text style={styles.selectedTitle}>{t('joinTrip.modal.selectedDates')}</Text>
                {selectedRides.length === 0 ? (
                  <Text style={styles.emptyText}>{t('joinTrip.modal.noSelectedDates')}</Text>
                ) : (
                  <View style={styles.selectedChipList}>
                    {selectedRides.map((ride) => (
                      <View key={getRideId(ride)} style={styles.selectedChip}>
                        <Text style={styles.selectedChipText}>
                          {formatSelectedRideChip(ride.scheduledDeparture, lang)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
          {selectionError ? <Text style={formStyles.errorText}>{selectionError}</Text> : null}
        </View>

        <Controller
          control={form.control}
          name="message"
          render={({ field, fieldState }) => (
            <View style={formStyles.field}>
              <Text style={formStyles.label}>{t('joinTrip.modal.messageLabel')}</Text>
              <TextInput
                autoCapitalize="sentences"
                editable={!isSubmitting}
                maxLength={MESSAGE_MAX_LENGTH}
                multiline
                numberOfLines={4}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder={t('joinTrip.modal.messagePlaceholder')}
                placeholderTextColor={Palette.textSecondary}
                style={[
                  formStyles.input,
                  formStyles.inputMultiline,
                  fieldState.error && formStyles.inputError,
                ]}
                textAlignVertical="top"
                value={field.value ?? ''}
              />
              <View style={styles.messageMetaRow}>
                {fieldState.error ? (
                  <Text style={formStyles.errorText}>
                    {t('joinTrip.validation.messageTooLong')}
                  </Text>
                ) : (
                  <Text style={styles.optionalText}>{t('joinTrip.modal.messageOptional')}</Text>
                )}
                <Text style={styles.counterText}>
                  {messageValue.length}/{MESSAGE_MAX_LENGTH}
                </Text>
              </View>
            </View>
          )}
        />

        {formError ? <Text style={formStyles.formError}>{formError}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={onClose}
          style={({ pressed }) => [
            formStyles.secondaryButton,
            pressed && !isSubmitting ? styles.pressed : null,
            isSubmitting && formStyles.primaryButtonDisabled,
          ]}
        >
          <Text style={formStyles.secondaryButtonText}>{t('joinTrip.modal.cancel')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
          disabled={isSubmitting}
          onPress={() => {
            void handleSubmit();
          }}
          style={({ pressed }) => [
            formStyles.primaryButton,
            pressed && !isSubmitting ? formStyles.primaryButtonPressed : null,
            isSubmitting && formStyles.primaryButtonDisabled,
          ]}
        >
          {isSubmitting ? (
            <View style={formStyles.loadingRow}>
              <ActivityIndicator color={Palette.textOnPrimary} size="small" />
              <Text style={formStyles.primaryButtonText}>{t('joinTrip.modal.sending')}</Text>
            </View>
          ) : (
            <Text style={formStyles.primaryButtonText}>{t('joinTrip.modal.send')}</Text>
          )}
        </Pressable>
      </View>

      {isCalendarMounted ? (
        <Modal
          animationType="none"
          onRequestClose={() => setIsCalendarVisible(false)}
          statusBarTranslucent
          transparent
          visible={isCalendarMounted}
        >
          <View style={styles.calendarOverlay}>
            <Animated.View style={[styles.calendarBackdrop, { opacity: calendarProgress }]} />
            <Pressable
              accessibilityLabel={t('common.action.close')}
              accessibilityRole="button"
              onPress={() => setIsCalendarVisible(false)}
              style={StyleSheet.absoluteFill}
            />
            <Animated.View
              style={[
                styles.calendarDialog,
                {
                  opacity: calendarProgress,
                  transform: [
                    {
                      scale: calendarProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.calendarHeaderRow}>
                <View style={styles.headerTextWrap}>
                  <Text style={styles.title}>{t('joinTrip.calendar.title')}</Text>
                  <Text style={styles.subtitle}>{t('joinTrip.calendar.subtitle')}</Text>
                </View>
                <Pressable
                  accessibilityLabel={t('common.action.close')}
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setIsCalendarVisible(false)}
                  style={styles.closeButton}
                >
                  <X color={Palette.textSecondary} size={20} />
                </Pressable>
              </View>
              <View style={styles.calendarWrap}>
                <Calendar
                  disableMonthChange
                  enableSwipeMonths
                  hideExtraDays={false}
                  markedDates={markedDates}
                  markingType="custom"
                  minDate={todayCalendarDate}
                  onDayPress={(day: DateData) => {
                    if (!availableRideByDate.has(day.dateString)) return;
                    toggleRidesForDate(day.dateString);
                  }}
                  showSixWeeks
                  theme={{
                    arrowColor: Palette.primary,
                    calendarBackground: Palette.card,
                    dayTextColor: Palette.text,
                    monthTextColor: Palette.text,
                    textDisabledColor: Palette.border,
                    todayTextColor: Palette.primary,
                  }}
                />
              </View>
              <View style={styles.calendarFooter}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsCalendarVisible(false)}
                  style={({ pressed }) => [
                    formStyles.primaryButton,
                    pressed && formStyles.primaryButtonPressed,
                  ]}
                >
                  <Text style={formStyles.primaryButtonText}>{t('joinTrip.calendar.done')}</Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '88%',
    backgroundColor: Palette.background,
    paddingHorizontal: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...Typography.titleSmall,
    color: Palette.text,
  },
  subtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    lineHeight: 20,
    marginTop: 3,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.label,
    color: Palette.text,
  },
  loadingRidesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  datePickerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  datePickerTitle: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  datePickerSubtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  calendarOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  calendarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Palette.overlay,
  },
  calendarDialog: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: Palette.background,
    borderRadius: Radii.xl,
    overflow: 'hidden',
    ...Shadow.authCard,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  calendarWrap: {
    backgroundColor: Palette.card,
    overflow: 'hidden',
    paddingHorizontal: Spacing.xl,
  },
  calendarFooter: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  selectedSection: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  selectedTitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  selectedChipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  selectedChip: {
    borderRadius: Radii.pill,
    backgroundColor: Palette.primarySurface,
    borderWidth: 1,
    borderColor: Palette.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  selectedChipText: {
    color: Palette.primaryDark,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  messageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  optionalText: {
    flex: 1,
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  counterText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  footer: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  pressed: {
    opacity: 0.86,
  },
});
