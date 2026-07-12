import { useLocalSearchParams, useRouter } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { authClient } from '@/features/auth/auth-client';
import AuthCard from '@/features/auth/components/auth-card';
import { AuthScreenLayout } from '@/features/auth/components/auth-screen-layout';
import { ResetPasswordForm } from '@/features/auth/forms/reset-password-form';
import type { ResetPasswordInput } from '@/features/auth/schemas';
import { mapErrorToMessageKey } from '@/shared/api';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ token?: string | string[]; error?: string | string[] }>();
  const token = firstParam(params.token);
  const callbackError = firstParam(params.error);
  const hasInvalidToken = Boolean(callbackError) || !token;
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function goToSignIn() {
    router.replace('/(auth)/sign-in');
  }

  async function handleSubmit(data: ResetPasswordInput) {
    if (!token) {
      setFormError(t('auth.resetPassword.invalidToken'));
      return;
    }

    setFormError(null);
    setSuccessMessage(null);
    try {
      const result = await authClient.resetPassword({
        newPassword: data.password,
        token,
      });
      if (result.error) {
        setFormError(t(mapErrorToMessageKey(result.error)));
        return;
      }
      setSuccessMessage(t('auth.resetPassword.success'));
    } catch (error) {
      setFormError(t(mapErrorToMessageKey(error)));
    }
  }

  return (
    <AuthScreenLayout>
      <AuthCard>
        <View style={styles.iconContainer}>
          <KeyRound color={Palette.primary} size={40} strokeWidth={1.75} />
        </View>

        <Text style={styles.title}>{t('auth.resetPassword.title')}</Text>
        <Text style={styles.description}>{t('auth.resetPassword.description')}</Text>

        {successMessage ? (
          <View style={styles.feedbackBlock}>
            <Text style={styles.successText}>{successMessage}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={goToSignIn}
              style={({ pressed }) => [
                formStyles.primaryButton,
                pressed && formStyles.primaryButtonPressed,
              ]}
            >
              <Text style={formStyles.primaryButtonText}>{t('auth.resetPassword.back')}</Text>
            </Pressable>
          </View>
        ) : hasInvalidToken ? (
          <View style={styles.feedbackBlock}>
            <Text style={formStyles.formError}>{t('auth.resetPassword.invalidToken')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={goToSignIn}
              style={({ pressed }) => [
                formStyles.primaryButton,
                pressed && formStyles.primaryButtonPressed,
              ]}
            >
              <Text style={formStyles.primaryButtonText}>{t('auth.resetPassword.back')}</Text>
            </Pressable>
          </View>
        ) : (
          <ResetPasswordForm formError={formError} onSubmit={handleSubmit} />
        )}
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
    color: Palette.text,
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.bold,
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
  feedbackBlock: {
    width: '100%',
    gap: Spacing.lg,
  },
  successText: {
    ...formStyles.successText,
    textAlign: 'center',
  },
});
