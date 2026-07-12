import { X } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type FindTripsFormState } from './use-find-trips-form';

import { RouteCard } from '@/features/trips/components/route-card';
import { type MapLocation } from '@/features/trips/create-trip/types';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';
import { DateTimeField } from '@/shared/ui/components/date-time-field';

type Props = {
  apiKey: string;
  form: FindTripsFormState;
  validationError: string | null;
  originLocation: MapLocation | null;
  destinationLocation: MapLocation | null;
  onChangeField: <K extends keyof FindTripsFormState>(key: K, value: FindTripsFormState[K]) => void;
  onSelectOriginPlace: (place: { address: string; latitude: number; longitude: number }) => void;
  onSelectDestinationPlace: (place: {
    address: string;
    latitude: number;
    longitude: number;
  }) => void;
  /** Optional clear handlers forwarded to the underlying RouteCard rows. */
  onClearOriginPlace?: () => void;
  onClearDestinationPlace?: () => void;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function isoDateToLocalDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return new Date();
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function localDateToIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeStringToDate(time: string | null): Date {
  const fallback = new Date();
  fallback.setHours(9, 0, 0, 0);
  if (!time) return fallback;
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

type DateLabels = { today: string; tomorrow: string; yesterday: string };

function naturalDateLabel(iso: string, lang: Lang, labels: DateLabels): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = isoDateToLocalDate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const today = startOfTodayLocal();
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return labels.today;
  if (diffDays === 1) return labels.tomorrow;
  if (diffDays === -1) return labels.yesterday;
  const localeMap: Record<Lang, string> = { en: 'en-US', es: 'es-ES', ca: 'ca-ES' };
  try {
    return new Intl.DateTimeFormat(localeMap[lang], {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    return iso;
  }
}

export function FindTripsFiltersSection({
  apiKey,
  form,
  validationError,
  originLocation,
  destinationLocation,
  onChangeField,
  onSelectOriginPlace,
  onSelectDestinationPlace,
  onClearOriginPlace,
  onClearDestinationPlace,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;

  const dateLabels: DateLabels = useMemo(
    () => ({
      today: t('common.date.today'),
      tomorrow: t('common.date.tomorrow'),
      yesterday: t('common.date.yesterday'),
    }),
    [t],
  );
  const dateValue = useMemo(() => isoDateToLocalDate(form.date), [form.date]);
  const dateDisplay = useMemo(
    () => naturalDateLabel(form.date, lang, dateLabels),
    [form.date, lang, dateLabels],
  );
  const timeValue = useMemo(
    () => timeStringToDate(form.earliestDeparture),
    [form.earliestDeparture],
  );
  const timeDisplay = form.earliestDeparture ?? t('findTrips.earliestDeparture.any');

  function handleSwap() {
    const nextOrigin = form.destination;
    const nextDestination = form.origin;
    onChangeField('origin', nextOrigin);
    onChangeField('destination', nextDestination);
  }

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('findTrips.route.sectionTitle')}</Text>
        <RouteCard
          apiKey={apiKey}
          destination={{
            rowLabel: t('findTrips.route.destinationLabel'),
            placeholder: t('createTrip.destination.placeholder'),
            value: form.destination,
            initialCenter: destinationLocation,
            drawerTitle: t('findTrips.route.destinationLabel'),
            mapTitle: t('createTrip.mapPicker.destinationTitle'),
            onClear: onClearDestinationPlace,
            onSelectPlace: onSelectDestinationPlace,
          }}
          hasError={validationError === 'origin' || validationError === 'destination'}
          onSwap={handleSwap}
          origin={{
            rowLabel: t('findTrips.route.originLabel'),
            placeholder: t('createTrip.origin.placeholder'),
            value: form.origin,
            initialCenter: originLocation,
            drawerTitle: t('findTrips.route.originLabel'),
            mapTitle: t('createTrip.mapPicker.originTitle'),
            onClear: onClearOriginPlace,
            onSelectPlace: onSelectOriginPlace,
          }}
          swapAccessibilityLabel={t('findTrips.route.swap')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('findTrips.when.sectionTitle')}</Text>
        <View style={styles.whenCard}>
          {form.tripType === 'all' ? (
            <>
              <DateTimeField
                cancelLabel={t('createTrip.time.cancel')}
                displayLabel={dateDisplay}
                doneLabel={t('createTrip.time.confirm')}
                inlineLabel={t('findTrips.date.inlineLabel')}
                minimumDate={new Date()}
                mode="date"
                onChange={(next) => onChangeField('date', localDateToIsoDate(next))}
                value={dateValue}
                variant="inline"
              />
              <View style={styles.divider} />
            </>
          ) : null}
          <View style={styles.timeRow}>
            <DateTimeField
              cancelLabel={t('createTrip.time.cancel')}
              displayLabel={timeDisplay}
              doneLabel={t('createTrip.time.confirm')}
              inlineLabel={t('findTrips.earliestDeparture.inlineLabel')}
              mode="time"
              onChange={(next) => onChangeField('earliestDeparture', dateToTimeString(next))}
              style={styles.timeField}
              value={timeValue}
              variant="inline"
            />
            {form.earliestDeparture ? (
              <Pressable
                accessibilityLabel={t('findTrips.earliestDeparture.clear')}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => onChangeField('earliestDeparture', null)}
                style={({ pressed }) => [styles.clearBtn, pressed && styles.clearBtnPressed]}
              >
                <X color={Palette.textSecondary} size={16} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.xs,
  },
  whenCard: {
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
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  timeField: {
    flex: 1,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.backgroundMuted,
  },
  clearBtnPressed: {
    opacity: 0.7,
  },
});
