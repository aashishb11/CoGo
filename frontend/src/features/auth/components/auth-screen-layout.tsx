import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette, Spacing } from '@/shared/theme';
import { BrandLogo } from '@/shared/ui/components/brand-logo';
import LanguageSwitcher from '@/shared/ui/language-switcher';

type AuthScreenLayoutProps = {
  children: ReactNode;
  /** Hide the language switcher (e.g. on create-profile, where the locale is
   * being set inside the form itself). */
  hideLanguageSwitcher?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * Shared scaffold for every screen under `(auth)/`. Owns the safe-area
 * insets, brand wordmark, and language switcher so individual screens only
 * concern themselves with their content. Keeps the visual layout consistent
 * across sign-in, sign-up, forgot-password, verify-email, and create-profile.
 */
export function AuthScreenLayout({
  children,
  hideLanguageSwitcher,
  contentStyle,
}: AuthScreenLayoutProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + Spacing.md,
              paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.lg,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {hideLanguageSwitcher ? (
            <View style={styles.topBarSpacer} />
          ) : (
            <View style={styles.topBar}>
              <LanguageSwitcher absolute={false} compact />
            </View>
          )}

          <View style={styles.brand}>
            <BrandLogo accessibilityLabel={t('header.brand')} size="auth" />
          </View>

          <View style={[styles.content, contentStyle]}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: Spacing.lg,
  },
  topBarSpacer: {
    height: Spacing.lg,
  },
  brand: {
    marginBottom: Spacing.xl,
  },
  content: {
    width: '100%',
    maxWidth: 460,
    alignItems: 'stretch',
    gap: Spacing.lg,
  },
});
