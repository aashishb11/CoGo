import { useEffect } from 'react';
import { type Control, Controller, type UseFormSetValue, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createTripStyles as styles } from './styles';
import { type CreateTripFormValues, WEEKDAY_LABELS } from './use-create-trip';

import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';
import { DateTimeField } from '@/shared/ui/components/date-time-field';

export type TripMode = 'recurring' | 'sporadic';

type Props = {
  control: Control<CreateTripFormValues>;
  mode: TripMode;
  setValue: UseFormSetValue<CreateTripFormValues>;
  readOnly?: boolean;
  hideRecurringDateRange?: boolean;
  /** ISO date strings (date-only) bounding the sporadic date picker for event trips. */
  eventDateMin?: string;
  eventDateMax?: string;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function isoDateToLocalDate(iso: string, fallback = new Date()): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return fallback;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function localDateToIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeStringToDate(time: string): Date {
  const fallback = new Date();
  fallback.setHours(9, 0, 0, 0);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return fallback;
  const result = new Date();
  result.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return result;
}

function dateToTimeString(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

type DateLabels = {
  today: string;
  tomorrow: string;
  yesterday: string;
  inDays: (count: number) => string;
  daysAgo: (count: number) => string;
};

// User-facing date label that prefers natural language ("Today", "Tomorrow",
// "In 30 days", "12 days ago") and falls back to a short Intl-formatted date
// when the offset is too far. Negative offsets only show up if a stored value
// drifted into the past — the form guards against picking past dates.
function naturalDateLabel(iso: string, lang: Lang, labels: DateLabels): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = isoDateToLocalDate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const today = startOfTodayLocal();
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return labels.today;
  if (diffDays === 1) return labels.tomorrow;
  if (diffDays === -1) return labels.yesterday;
  if (diffDays > 1 && diffDays <= 60) return labels.inDays(diffDays);
  if (diffDays < -1 && diffDays >= -60) return labels.daysAgo(Math.abs(diffDays));
  const localeMap: Record<Lang, string> = { en: 'en-US', es: 'es-ES', ca: 'ca-ES' };
  try {
    return new Intl.DateTimeFormat(localeMap[lang], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return iso;
  }
}

// For sporadic same-day departure, compute the soonest allowed Date so the
// time picker won't let the user pick a moment in the past. Returns null when
// the chosen day is in the future (no per-day-of restriction needed).
function minimumTimeForSporadic(dateIso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const picked = isoDateToLocalDate(dateIso);
  const today = startOfTodayLocal();
  if (picked.getTime() > today.getTime()) return null;
  return new Date();
}

const WEEKDAY_LETTERS: Record<Lang, string[]> = {
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  ca: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
};

export function ScheduleSection({
  control,
  mode,
  setValue,
  readOnly = false,
  hideRecurringDateRange = false,
  eventDateMin,
  eventDateMax,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;
  const weekdays = WEEKDAY_LETTERS[lang] ?? WEEKDAY_LABELS[lang];

  const dateLabels: DateLabels = {
    today: t('common.date.today'),
    tomorrow: t('common.date.tomorrow'),
    yesterday: t('common.date.yesterday'),
    inDays: (count) => t('common.date.inDays', { count }),
    daysAgo: (count) => t('common.date.daysAgo', { count }),
  };

  const startDateValue = (useWatch({ control, name: 'startDate' }) as string | undefined) ?? '';
  const endDateValue = (useWatch({ control, name: 'endDate' }) as string | undefined) ?? '';
  const sporadicDateValue = (useWatch({ control, name: 'date' }) as string | undefined) ?? '';

  useEffect(() => {
    if (readOnly) return;
    if (mode === 'recurring') {
      setValue('date', '', { shouldValidate: false });
    } else {
      setValue('days', [], { shouldValidate: false });
    }
  }, [mode, readOnly, setValue]);

  // When event date bounds are first applied (or change), snap the sporadic
  // date into the valid window. Also pre-fills an empty date with the soonest
  // valid day.
  useEffect(() => {
    if (mode !== 'sporadic' || (!eventDateMin && !eventDateMax)) return;
    const minIso = localDateToIsoDate(sporadicMinDate);
    const maxIso = sporadicMaxDate ? localDateToIsoDate(sporadicMaxDate) : null;
    if (!sporadicDateValue || sporadicDateValue < minIso) {
      setValue('date', minIso, { shouldValidate: false });
    } else if (maxIso && sporadicDateValue > maxIso) {
      setValue('date', maxIso, { shouldValidate: false });
    }
    // Only run when bounds change — not on every sporadicDateValue change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventDateMin, eventDateMax, mode]);

  const today = startOfTodayLocal();
  // End date must be strictly after the start date (a one-day recurring
  // schedule isn't meaningful). Floor at today+1 so the picker can never
  // offer a past day either.
  const startDateForEndMin = isoDateToLocalDate(startDateValue, today);
  const endMinimum =
    startDateForEndMin.getTime() > today.getTime()
      ? addDays(startDateForEndMin, 1)
      : addDays(today, 1);

  const minimumTimeIfApplies =
    mode === 'sporadic' ? minimumTimeForSporadic(sporadicDateValue) : null;

  // When event bounds are present, compute the effective sporadic date range.
  // eventDateMin/Max are date-only ISO strings (midnight UTC) — use the date
  // portion directly via isoDateToLocalDate to avoid timezone shifts.
  const eventMinDate = eventDateMin ? isoDateToLocalDate(eventDateMin) : null;
  const eventMaxDate = eventDateMax ? isoDateToLocalDate(eventDateMax) : null;
  const sporadicMinDate = eventMinDate
    ? eventMinDate.getTime() > today.getTime()
      ? eventMinDate
      : today
    : today;
  const sporadicMaxDate = eventMaxDate ?? undefined;

  const showRecurringDates = mode === 'recurring' && !hideRecurringDateRange;
  const showSporadicDate = mode === 'sporadic';

  return (
    <View style={localStyles.section}>
      <Text style={styles.label}>{t('createTrip.scheduleSection.title')}</Text>

      {mode === 'recurring' ? (
        <Controller
          control={control}
          name="days"
          render={({ field, fieldState }) => (
            <>
              <View style={localStyles.weekdayCard}>
                {weekdays.map((label, index) => {
                  const selected = field.value.includes(index);
                  return (
                    <Pressable
                      accessibilityRole="button"
                      disabled={readOnly}
                      key={`${label}-${index}`}
                      onPress={() => {
                        const next = selected
                          ? field.value.filter((value) => value !== index)
                          : [...field.value, index];
                        field.onChange(next);
                      }}
                      style={[localStyles.weekdayPill, selected && localStyles.weekdayPillSelected]}
                    >
                      <Text
                        style={[
                          localStyles.weekdayPillText,
                          selected && localStyles.weekdayPillTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {fieldState.error ? (
                <Text style={styles.errorText}>{t('createTrip.weekdays.label')}</Text>
              ) : null}
            </>
          )}
        />
      ) : null}

      <View style={localStyles.scheduleCard}>
        {showRecurringDates ? (
          <>
            <Controller
              control={control}
              name="startDate"
              render={({ field, fieldState }) => {
                const display = naturalDateLabel(field.value, lang, dateLabels);
                return (
                  <>
                    <DateTimeField
                      cancelLabel={t('createTrip.time.cancel')}
                      displayLabel={display || t('createTrip.date.placeholder')}
                      doneLabel={t('createTrip.time.confirm')}
                      inlineLabel={t('createTrip.startDate.inlineLabel')}
                      minimumDate={today}
                      mode="date"
                      onChange={(next) => {
                        const nextIso = localDateToIsoDate(next);
                        field.onChange(nextIso);
                        // Auto-bump the end date if the new start date would
                        // make the existing range invalid (end <= start).
                        // We pick start+90d to roughly match the default
                        // 3-month range.
                        if (endDateValue && endDateValue <= nextIso) {
                          setValue('endDate', localDateToIsoDate(addDays(next, 90)), {
                            shouldValidate: false,
                          });
                        }
                      }}
                      value={isoDateToLocalDate(field.value)}
                      variant="inline"
                    />
                    {fieldState.error ? (
                      <Text style={styles.errorText}>{t('createTrip.date.invalid')}</Text>
                    ) : null}
                  </>
                );
              }}
            />
            <View style={localStyles.divider} />
            <Controller
              control={control}
              name="endDate"
              render={({ field, fieldState }) => {
                const display = naturalDateLabel(field.value, lang, dateLabels);
                return (
                  <>
                    <DateTimeField
                      cancelLabel={t('createTrip.time.cancel')}
                      displayLabel={display || t('createTrip.date.placeholder')}
                      doneLabel={t('createTrip.time.confirm')}
                      inlineLabel={t('createTrip.endDate.inlineLabel')}
                      minimumDate={endMinimum}
                      mode="date"
                      onChange={(next) => field.onChange(localDateToIsoDate(next))}
                      value={isoDateToLocalDate(field.value)}
                      variant="inline"
                    />
                    {fieldState.error ? (
                      <Text style={styles.errorText}>{t('createTrip.date.invalid')}</Text>
                    ) : null}
                  </>
                );
              }}
            />
            <View style={localStyles.divider} />
          </>
        ) : null}

        {showSporadicDate ? (
          <>
            <Controller
              control={control}
              name="date"
              render={({ field, fieldState }) => {
                const display = naturalDateLabel(field.value, lang, dateLabels);
                return (
                  <>
                    <DateTimeField
                      cancelLabel={t('createTrip.time.cancel')}
                      displayLabel={display || t('createTrip.date.placeholder')}
                      doneLabel={t('createTrip.time.confirm')}
                      inlineLabel={t('createTrip.dateField.inlineLabel')}
                      maximumDate={sporadicMaxDate}
                      minimumDate={sporadicMinDate}
                      mode="date"
                      onChange={(next) => field.onChange(localDateToIsoDate(next))}
                      value={isoDateToLocalDate(field.value)}
                      variant="inline"
                    />
                    {fieldState.error ? (
                      <Text style={styles.errorText}>{t('createTrip.date.invalid')}</Text>
                    ) : null}
                  </>
                );
              }}
            />
            <View style={localStyles.divider} />
          </>
        ) : null}

        <Controller
          control={control}
          name="time"
          render={({ field, fieldState }) => (
            <>
              <DateTimeField
                cancelLabel={t('createTrip.time.cancel')}
                displayLabel={field.value || t('createTrip.time.placeholder')}
                doneLabel={t('createTrip.time.confirm')}
                inlineLabel={t('createTrip.time.inlineLabel')}
                minimumDate={minimumTimeIfApplies ?? undefined}
                mode="time"
                onChange={(next) => field.onChange(dateToTimeString(next))}
                value={timeStringToDate(field.value)}
                variant="inline"
              />
              {fieldState.error ? (
                <Text style={styles.errorText}>{t('createTrip.time.label')}</Text>
              ) : null}
            </>
          )}
        />
      </View>

      {readOnly ? (
        <Text style={styles.lockedNotice}>{t('editTrip.scheduleLockedNotice')}</Text>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  weekdayCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 14,
    padding: 6,
  },
  weekdayPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  weekdayPillSelected: {
    backgroundColor: Palette.primary,
  },
  weekdayPillText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  weekdayPillTextSelected: {
    color: Palette.textOnPrimary,
  },
  section: {
    gap: Spacing.md,
  },
  scheduleCard: {
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 16,
    paddingHorizontal: Spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: Palette.border,
    marginLeft: 96 + Spacing.md,
  },
});
