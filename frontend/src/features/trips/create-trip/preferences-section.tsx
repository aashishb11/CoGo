import {
  Cigarette,
  CigaretteOff,
  Megaphone,
  MessageCircle,
  Music,
  VolumeX,
} from 'lucide-react-native';
import { Controller, type Control, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { createTripStyles as styles } from './styles';
import { type CreateTripFormValues, MUSIC_OPTIONS } from './use-create-trip';

import { type MusicPreference } from '@/features/trips/create-trip/types';
import { type TextKey } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type Props = {
  control: Control<CreateTripFormValues>;
};

type ChipProps = {
  selected: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  label: string;
};

function Chip({ selected, onPress, icon, label }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        chipStyles.chip,
        selected && chipStyles.chipSelected,
        pressed && chipStyles.chipPressed,
      ]}
    >
      {icon}
      <Text style={[chipStyles.label, selected && chipStyles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

export function PreferencesSection({ control }: Props) {
  const { t } = useTranslation();
  const conversationStyle = useWatch({ control, name: 'preferences.conversationStyle' });
  const smoker = useWatch({ control, name: 'preferences.smoker' });

  const chattyIconColor = conversationStyle === 'chatty' ? Palette.textOnPrimary : Palette.text;
  const casualIconColor = conversationStyle === 'casual' ? Palette.textOnPrimary : Palette.text;
  const quietIconColor = conversationStyle === 'quiet' ? Palette.textOnPrimary : Palette.text;
  const smokerIconColor = smoker ? Palette.textOnPrimary : Palette.text;
  const nonSmokerIconColor = !smoker ? Palette.textOnPrimary : Palette.text;

  return (
    <>
      <View style={chipStyles.group}>
        <Text style={styles.label}>{t('createTrip.preferences.conversationStyle')}</Text>
        <View style={chipStyles.chipsRow}>
          <Controller
            control={control}
            name="preferences.conversationStyle"
            render={({ field }) => (
              <>
                <Chip
                  icon={<Megaphone color={chattyIconColor} size={16} />}
                  label={t('createTrip.preferences.conversation.chatty')}
                  onPress={() => field.onChange('chatty')}
                  selected={field.value === 'chatty'}
                />
                <Chip
                  icon={<MessageCircle color={casualIconColor} size={16} />}
                  label={t('createTrip.preferences.conversation.casual')}
                  onPress={() => field.onChange('casual')}
                  selected={field.value === 'casual'}
                />
                <Chip
                  icon={<VolumeX color={quietIconColor} size={16} />}
                  label={t('createTrip.preferences.conversation.quiet')}
                  onPress={() => field.onChange('quiet')}
                  selected={field.value === 'quiet'}
                />
              </>
            )}
          />
        </View>
      </View>

      <View style={chipStyles.group}>
        <Text style={styles.label}>{t('createTrip.preferences.smokingLabel')}</Text>
        <View style={chipStyles.chipsRow}>
          <Controller
            control={control}
            name="preferences.smoker"
            render={({ field }) => (
              <>
                <Chip
                  icon={<Cigarette color={smokerIconColor} size={16} />}
                  label={t('createTrip.preferences.smoker')}
                  onPress={() => field.onChange(true)}
                  selected={field.value}
                />
                <Chip
                  icon={<CigaretteOff color={nonSmokerIconColor} size={16} />}
                  label={t('createTrip.preferences.nonSmoker')}
                  onPress={() => field.onChange(false)}
                  selected={!field.value}
                />
              </>
            )}
          />
        </View>
      </View>

      <Controller
        control={control}
        name="preferences.musicGenres"
        render={({ field }) => {
          const currentGenre: MusicPreference | null = field.value[0] ?? null;
          const musicAllowed = currentGenre !== null;
          const toggleMusic = (next: boolean) => {
            field.onChange(next && currentGenre === null ? ['pop'] : next ? field.value : []);
          };
          const pickGenre = (next: MusicPreference) => {
            field.onChange(currentGenre === next ? [] : [next]);
          };
          return (
            <View style={musicStyles.card}>
              <View style={[musicStyles.headerRow, musicAllowed && musicStyles.headerRowOpen]}>
                <View style={musicStyles.titleWrap}>
                  <Music color={Palette.text} size={18} />
                  <Text style={musicStyles.title}>
                    {t('createTrip.preferences.music.cardTitle')}
                  </Text>
                </View>
                <Switch
                  ios_backgroundColor={Palette.border}
                  onValueChange={toggleMusic}
                  thumbColor={Palette.card}
                  trackColor={{ false: Palette.border, true: Palette.primary }}
                  value={musicAllowed}
                />
              </View>

              {musicAllowed ? (
                <View style={musicStyles.body}>
                  <Text style={musicStyles.bodyHint}>
                    {t('createTrip.preferences.music.pickGenre')}
                  </Text>
                  <View style={musicStyles.genreRow}>
                    {MUSIC_OPTIONS.map((option) => {
                      const selected = currentGenre === option.value;
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          key={option.value}
                          onPress={() => pickGenre(option.value)}
                          style={[musicStyles.genrePill, selected && musicStyles.genrePillSelected]}
                        >
                          <Text
                            style={[
                              musicStyles.genrePillText,
                              selected && musicStyles.genrePillTextSelected,
                            ]}
                          >
                            {t(option.labelKey as TextKey)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </>
  );
}

const chipStyles = StyleSheet.create({
  group: {
    gap: Spacing.md,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
    ...Shadow.cardSoft,
  },
  chipSelected: {
    backgroundColor: Palette.primary,
    borderColor: Palette.primary,
  },
  chipPressed: {
    opacity: 0.85,
  },
  label: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  labelSelected: {
    color: Palette.textOnPrimary,
  },
});

const musicStyles = StyleSheet.create({
  card: {
    // No marginTop — the parent screen's section gap (Spacing.lg) already
    // separates this card from the smoking/conversation groups above.
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    ...Shadow.cardSoft,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  headerRowOpen: {
    paddingBottom: Spacing.md,
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  body: {
    gap: Spacing.sm,
  },
  bodyHint: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs + 2,
  },
  genrePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  genrePillSelected: {
    backgroundColor: Palette.primarySurface,
    borderColor: Palette.primary,
  },
  genrePillText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  genrePillTextSelected: {
    color: Palette.primaryDark,
  },
});
