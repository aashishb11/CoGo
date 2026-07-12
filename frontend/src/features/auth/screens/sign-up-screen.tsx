import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { authClient, buildAuthCallbackURL } from '@/features/auth/auth-client';
import AuthCard from '@/features/auth/components/auth-card';
import { AuthScreenLayout } from '@/features/auth/components/auth-screen-layout';
import { GoogleAuthButton } from '@/features/auth/components/google-auth-button';
import { SignUpForm, type SignUpFormSubmitValues } from '@/features/auth/forms/sign-up-form';
import { mapErrorToMessageKey } from '@/shared/api';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';

export default function SignUpScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  async function handleSignUp(data: SignUpFormSubmitValues) {
    setFormError(null);

    try {
      const result = await authClient.signUp.email({
        name: data.fullName.trim(),
        email: data.email.trim(),
        password: data.password,
      });

      if (result.error) {
        setFormError(t(mapErrorToMessageKey(result.error)));
        return;
      }

      router.replace({ pathname: '/(auth)/verify-email', params: { email: data.email.trim() } });
    } catch (error) {
      setFormError(t(mapErrorToMessageKey(error)));
    }
  }

  async function handleGoogleSignUp() {
    setFormError(null);
    setIsGoogleLoading(true);
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: buildAuthCallbackURL('/'),
      });
      if (result?.error) {
        setFormError(t(mapErrorToMessageKey(result.error)));
      }
    } catch (error) {
      setFormError(t(mapErrorToMessageKey(error)));
    } finally {
      setIsGoogleLoading(false);
    }
  }

  return (
    <AuthScreenLayout>
      <AuthCard>
        <Text style={styles.title}>{t('auth.signup.title')}</Text>
        <SignUpForm formError={formError} onSubmit={handleSignUp} />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('auth.social.divider')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <GoogleAuthButton
          label={t('auth.social.continueWithGoogle')}
          loading={isGoogleLoading}
          onPress={() => {
            void handleGoogleSignUp();
          }}
        />
      </AuthCard>

      <TouchableOpacity onPress={() => router.back()} style={styles.footer}>
        <Text style={styles.footerText}>
          {t('auth.signup.hasAccount')} <Text style={styles.link}>{t('auth.signup.signin')}</Text>
        </Text>
      </TouchableOpacity>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.bold,
    color: Palette.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Palette.border,
  },
  dividerText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  footer: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  footerText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
  },
  link: {
    color: Palette.primary,
    fontWeight: FontWeight.bold,
  },
});
