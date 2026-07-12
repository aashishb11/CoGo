import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { dayKey, formatWeekdayLetter, isSameLocalDay } from '@/features/agenda/utils/dates';
import { toLang, type Lang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';

const PILL_WIDTH = 52;
const PILL_GAP = Spacing.sm;

type DatePillStripProps = {
  dates: Date[];
  selected: Date;
  daysWithRides: Set<string>;
  onSelect: (d: Date) => void;
};

export function DatePillStrip({ dates, selected, daysWithRides, onSelect }: DatePillStripProps) {
  const { i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;

  const initialIndex = Math.max(
    0,
    dates.findIndex((d) => isSameLocalDay(d, selected)),
  );

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={dates}
      getItemLayout={(_, index) => ({
        length: PILL_WIDTH + PILL_GAP,
        offset: (PILL_WIDTH + PILL_GAP) * index,
        index,
      })}
      horizontal
      initialScrollIndex={initialIndex}
      keyExtractor={(d) => dayKey(d)}
      renderItem={({ item }) => (
        <DatePill
          date={item}
          hasRide={daysWithRides.has(dayKey(item))}
          isSelected={isSameLocalDay(item, selected)}
          lang={lang}
          onPress={() => onSelect(item)}
        />
      )}
      showsHorizontalScrollIndicator={false}
    />
  );
}

type DatePillProps = {
  date: Date;
  isSelected: boolean;
  hasRide: boolean;
  lang: Lang;
  onPress: () => void;
};

function DatePill({ date, isSelected, hasRide, lang, onPress }: DatePillProps) {
  const letter = formatWeekdayLetter(date, lang);
  const dayNumber = String(date.getDate());

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && !isSelected ? styles.pillPressed : null]}
    >
      <Text style={styles.weekdayLetter}>{letter}</Text>
      <View style={[styles.dayCircle, isSelected ? styles.dayCircleSelected : null]}>
        <Text style={[styles.dayText, isSelected ? styles.dayTextSelected : null]}>
          {dayNumber}
        </Text>
      </View>
      <View style={[styles.dot, hasRide ? styles.dotVisible : null]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    gap: PILL_GAP,
  },
  pill: {
    width: PILL_WIDTH,
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.xs,
  },
  pillPressed: {
    opacity: 0.7,
  },
  weekdayLetter: {
    color: Palette.textSecondary,
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: Palette.primary,
  },
  dayText: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
  dayTextSelected: {
    color: Palette.textOnPrimary,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  dotVisible: {
    backgroundColor: Palette.primary,
  },
});
