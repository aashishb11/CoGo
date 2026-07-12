import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { IncidentCategory, IncidentResponseDto } from '@/features/incidents/types';
import { type Lang, toLang, type TextKey } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

const CATEGORY_LABEL_KEY: Record<IncidentCategory, TextKey> = {
  harassment: 'incidents.category.harassment',
  unsafe_driving: 'incidents.category.unsafe_driving',
  accident: 'incidents.category.accident',
  other: 'incidents.category.other',
};

type Props = {
  incident: IncidentResponseDto;
  onPress?: () => void;
  subtitle?: string;
};

function formatDateTime(value: string, lang: Lang) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat(lang, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(parsed));
}

export function IncidentRow({ incident, onPress, subtitle }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage ?? i18n.language) ?? 'es') as Lang;
  const categoryLabel = t(CATEGORY_LABEL_KEY[incident.category]);
  const when = formatDateTime(incident.createdAt, lang);
  const pressable = Boolean(onPress);

  return (
    <Pressable
      accessibilityRole={pressable ? 'button' : undefined}
      disabled={!pressable}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && pressable && styles.rowPressed]}
    >
      <View style={styles.iconCircle}>
        <AlertTriangle color={Palette.danger} size={18} strokeWidth={2.25} />
      </View>
      <View style={styles.info}>
        <Text numberOfLines={1} style={styles.category}>
          {categoryLabel}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {subtitle ?? when}
        </Text>
        {incident.note ? (
          <Text numberOfLines={2} style={styles.note}>
            {incident.note}
          </Text>
        ) : null}
      </View>
      {pressable ? <ChevronRight color={Palette.textSecondary} size={18} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
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
  rowPressed: {
    opacity: 0.85,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.dangerSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  category: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  subtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  note: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
});
