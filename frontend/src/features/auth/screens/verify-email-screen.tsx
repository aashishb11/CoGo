import { useLocalSearchParams, useRouter } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import AuthCard from '@/features/auth/components/auth-card';
import { AuthScreenLayout } from '@/features/auth/components/auth-screen-layout';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  // sign-up forwards the email here so we can prefill the sign-in form.
  const { email } = useLocalSearchParams<{ email?: string }>();

  function goToSignIn() {
    router.replace({ pathname: '/(auth)/sign-in', params: email ? { email } : undefined });
  }

  return (
    <AuthScreenLayout>
      <AuthCard>
        <View style={styles.iconContainer}>
          <Mail color={Palette.primary} size={40} strokeWidth={1.75} />
        </View>

        <Text style={styles.title}>{t('auth.verifyEmail.title')}</Text>
        <Text style={styles.description}>{t('auth.verifyEmail.description')}</Text>

        <Pressable
          accessibilityRole="button"
          onPress={goToSignIn}
          style={({ pressed }) => [
            formStyles.primaryButton,
            pressed && formStyles.primaryButtonPressed,
          ]}
        >
          <Text style={formStyles.primaryButtonText}>{t('auth.verifyEmail.button')}</Text>
        </Pressable>
      </AuthCard>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.bold,
    color: Palette.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  description: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
});
