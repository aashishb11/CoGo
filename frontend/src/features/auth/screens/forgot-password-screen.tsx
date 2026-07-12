import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { authClient, buildAuthCallbackURL } from '@/features/auth/auth-client';
import AuthCard from '@/features/auth/components/auth-card';
import { AuthScreenLayout } from '@/features/auth/components/auth-screen-layout';
import { ForgotPasswordForm } from '@/features/auth/forms/forgot-password-form';
import type { ForgotPasswordInput } from '@/features/auth/schemas';
import { mapErrorToMessageKey } from '@/shared/api';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  // sign-in forwards the email here so users don't have to retype it.
  const { email: prefillEmail } = useLocalSearchParams<{ email?: string }>();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(data: ForgotPasswordInput) {
    setFormError(null);
    setSuccessMessage(null);
    try {
      const result = await authClient.requestPasswordReset({
        email: data.email,
        redirectTo: buildAuthCallbackURL('/reset-password'),
      });
      if (result.error) {
        setFormError(t(mapErrorToMessageKey(result.error)));
        return;
      }
      // Better-Auth always returns success here even when the email isn't
      // registered (timing-attack mitigation), so the message is intentionally
      // generic.
      setSuccessMessage(t('auth.forgotPassword.success'));
    } catch (error) {
      setFormError(t(mapErrorToMessageKey(error)));
    }
  }

  return (
    <AuthScreenLayout>
      <AuthCard>
        <Text style={styles.title}>{t('auth.forgotPassword.title')}</Text>
        <Text style={styles.description}>{t('auth.forgotPassword.description')}</Text>

        <ForgotPasswordForm
          defaultValues={prefillEmail ? { email: prefillEmail } : undefined}
          formError={formError}
          onSubmit={handleSubmit}
          successMessage={successMessage}
        />
      </AuthCard>

      <TouchableOpacity onPress={() => router.back()} style={styles.footer}>
        <Text style={styles.link}>{t('auth.forgotPassword.back')}</Text>
      </TouchableOpacity>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
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
  footer: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  link: {
    color: Palette.primary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
