import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { authClient, buildAuthCallbackURL } from '@/features/auth/auth-client';
import AuthCard from '@/features/auth/components/auth-card';
import { AuthScreenLayout } from '@/features/auth/components/auth-screen-layout';
import { GoogleAuthButton } from '@/features/auth/components/google-auth-button';
import { SignInForm, type SignInFormSubmitValues } from '@/features/auth/forms/sign-in-form';
import { useSession } from '@/features/auth/queries';
import { getMyProfile } from '@/features/profile/api';
import { mapErrorToMessageKey } from '@/shared/api';
import i18n, { toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const session = useSession();
  // verify-email forwards the email here so we can prefill the form.
  const { email: prefillEmail } = useLocalSearchParams<{ email?: string }>();
  const [formError, setFormError] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // If a session is already loaded when the user lands here, bounce them
  // forward. The session hook updates synchronously after sign-in/sign-out,
  // so this also covers the post-verify-email case.
  useEffect(() => {
    if (session.isPending) return;
    const userId = session.data?.user?.id;
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await getMyProfile();
        if (cancelled) return;
        const profileLocale = toLang(profile?.locale);
        if (profileLocale) void i18n.changeLanguage(profileLocale);
        router.replace(profile ? '/(tabs)' : '/(auth)/create-profile');
      } catch {
        // Session was cleared mid-flight (e.g. just after sign-out). Stay on
        // sign-in — the session atom will settle to null and the guard above
        // will prevent a re-run.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.isPending, session.data?.user?.id, router]);

  async function handleGoogleSignIn() {
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
      // On success, better-auth's expo plugin handles the redirect back via
      // the cogo:// scheme; the session-watch effect above will route the
      // user to /(tabs) or /(auth)/create-profile once the session lands.
    } catch (error) {
      setFormError(t(mapErrorToMessageKey(error)));
    } finally {
      setIsGoogleLoading(false);
    }
  }

  async function handleSignIn(data: SignInFormSubmitValues) {
    setFormError(null);
    try {
      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
        rememberMe: data.rememberMe,
      });
      if (result.error) {
        setFormError(t(mapErrorToMessageKey(result.error)));
        return;
      }
      const userId = result.data?.user?.id;
      if (!userId) {
        setFormError(t('auth.signIn.error.noSession'));
        return;
      }
      const profile = await getMyProfile();
      const profileLocale = toLang(profile?.locale);
      if (profileLocale) void i18n.changeLanguage(profileLocale);
      router.replace(profile ? '/(tabs)' : '/(auth)/create-profile');
    } catch (error) {
      setFormError(t(mapErrorToMessageKey(error)));
    }
  }

  return (
    <AuthScreenLayout>
      <Text style={styles.title}>{t('auth.login.welcome')}</Text>

      <AuthCard>
        <SignInForm
          defaultValues={prefillEmail ? { email: prefillEmail } : undefined}
          formError={formError}
          isCheckingSession={session.isPending}
          onSubmit={handleSignIn}
          onForgotPassword={(email) =>
            router.push({
              pathname: '/(auth)/forgot-password',
              params: email ? { email } : undefined,
            })
          }
        />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('auth.social.divider')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <GoogleAuthButton
          label={t('auth.social.continueWithGoogle')}
          loading={isGoogleLoading}
          onPress={() => {
            void handleGoogleSignIn();
          }}
        />
      </AuthCard>

      <TouchableOpacity onPress={() => router.push('/(auth)/sign-up')} style={styles.footer}>
        <Text style={styles.footerText}>
          {t('auth.login.noAccount')} <Text style={styles.link}>{t('auth.login.signup')}</Text>
        </Text>
      </TouchableOpacity>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: FontSize['5xl'],
    fontWeight: FontWeight.bold,
    color: Palette.text,
    textAlign: 'center',
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
