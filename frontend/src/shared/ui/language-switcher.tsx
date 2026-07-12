import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import i18n, { type Lang, SUPPORTED_LANGS, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';

type LanguageSwitcherProps = {
  compact?: boolean;
  top?: number;
  right?: number;
  absolute?: boolean;
  value?: Lang;
  onChange?: (nextLang: Lang) => void;
};

export default function LanguageSwitcher({
  compact = false,
  top = 20,
  right = 20,
  absolute = true,
  value,
  onChange,
}: LanguageSwitcherProps) {
  const { i18n: i18nHook } = useTranslation();
  const lang = (toLang(i18nHook.resolvedLanguage) ?? 'es') as Lang;
  const currentLang = value ?? lang;
  const handleChange =
    onChange ??
    ((next: Lang) => {
      void i18n.changeLanguage(next);
    });

  return (
    <View style={absolute ? [styles.languageRow, { top, right }] : styles.inlineLanguageRow}>
      <View style={[styles.languageSwitch, compact && styles.languageSwitchCompact]}>
        {SUPPORTED_LANGS.map((option) => {
          const isActive = option === currentLang;
          return (
            <Pressable
              key={option}
              onPress={() => handleChange(option)}
              style={[
                styles.languageButton,
                compact && styles.languageButtonCompact,
                isActive && styles.languageButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.languageButtonText,
                  compact && styles.languageButtonTextCompact,
                  isActive && styles.languageButtonTextActive,
                ]}
              >
                {option.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  languageRow: {
    position: 'absolute',
    top: Spacing.xl,
    right: Spacing.xl,
    alignItems: 'flex-end',
    zIndex: 1,
  },
  inlineLanguageRow: {
    alignItems: 'flex-start',
  },
  languageSwitch: {
    flexDirection: 'row',
    backgroundColor: Palette.background,
    borderRadius: Radii.sm + 2,
    padding: Spacing.xs,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  languageSwitchCompact: {
    padding: 2,
    borderRadius: Radii.sm + 1,
  },
  languageButton: {
    borderRadius: Radii.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  languageButtonCompact: {
    paddingHorizontal: 10,
    paddingVertical: Spacing.xs,
  },
  languageButtonActive: {
    backgroundColor: Palette.card,
  },
  languageButtonText: {
    color: Palette.textSecondary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
  },
  languageButtonTextCompact: {
    fontSize: FontSize.sm,
  },
  languageButtonTextActive: {
    color: Palette.primary,
  },
});
