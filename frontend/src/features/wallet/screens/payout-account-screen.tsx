import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Banknote, ExternalLink } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { PayoutStatusPill } from '@/features/wallet/components/payout-status-pill';
import {
  useCreatePayoutAccount,
  useInvalidateWallet,
  usePayoutAccountStatus,
} from '@/features/wallet/queries';
import type { PayoutStatus } from '@/features/wallet/types';
import { mapErrorToMessageKey } from '@/shared/api';
import { env } from '@/shared/env';
import { type TextKey } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { Toast, type ToastKind } from '@/shared/ui/components/toast';

type ToastState = { kind: ToastKind; message: string } | null;

const STATUS_TITLE: Record<PayoutStatus, TextKey> = {
  none: 'wallet.payout.detail.none.title',
  pending: 'wallet.payout.detail.pending.title',
  active: 'wallet.payout.detail.active.title',
  restricted: 'wallet.payout.detail.restricted.title',
};

const STATUS_DESCRIPTION: Record<PayoutStatus, TextKey> = {
  none: 'wallet.payout.detail.none.description',
  pending: 'wallet.payout.detail.pending.description',
  active: 'wallet.payout.detail.active.description',
  restricted: 'wallet.payout.detail.restricted.description',
};

export default function PayoutAccountScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const session = useRequireAuth();
  const userId = session.data?.user?.id ?? null;

  const statusQuery = usePayoutAccountStatus(userId);
  const payoutAccountMutation = useCreatePayoutAccount(userId);
  const invalidateWallet = useInvalidateWallet(userId);

  const [toast, setToast] = useState<ToastState>(null);
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const dismissToast = useCallback(() => setToast(null), []);

  const refetchStatus = statusQuery.refetch;

  // This screen is the deep-link target on return from Stripe Connect
  // onboarding (cogo://wallet/payout-account). Refresh on focus so the new
  // status is reflected even if the browser closed before our WebBrowser
  // promise resolved.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void refetchStatus();
      invalidateWallet();
    }, [refetchStatus, invalidateWallet, userId]),
  );

  const handlePullToRefresh = useCallback(async () => {
    setIsManualRefresh(true);
    try {
      await refetchStatus();
    } finally {
      setIsManualRefresh(false);
    }
  }, [refetchStatus]);

  const isInitialLoading = session.isPending || (userId !== null && statusQuery.isLoading);
  const errorMessage = statusQuery.error ? t(mapErrorToMessageKey(statusQuery.error)) : '';
  const status = statusQuery.data?.status ?? 'none';
  const isActive = status === 'active';

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/wallet');
  }

  async function handleStartOnboarding() {
    try {
      const result = await payoutAccountMutation.mutateAsync();
      // Stripe Connect's `accountLinks.create` requires an http(s) return URL,
      // so onboarding redirects to a backend bounce page rather than a
      // cogo:// deep link. WebBrowser closes on the URL match; the wallet
      // and status queries refetch on focus when the user returns.
      await WebBrowser.openAuthSessionAsync(
        result.onboardingUrl,
        `${env.EXPO_PUBLIC_API_BASE_URL}/api/wallet/connect-return`,
      );
      invalidateWallet();
      void statusQuery.refetch();
    } catch (error) {
      setToast({ kind: 'error', message: t(mapErrorToMessageKey(error)) });
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack, accessibilityLabel: t('viewProfile.back') }}
        subtitle={t('wallet.payout.detail.subtitle')}
        title={t('wallet.payout.detail.title')}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={handlePullToRefresh}
            refreshing={isManualRefresh}
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {isInitialLoading ? (
            <View style={[styles.statusCard, styles.loadingRow]}>
              <ActivityIndicator color={Palette.primary} size="small" />
              <Text style={styles.loadingText}>{t('wallet.payout.detail.loading')}</Text>
            </View>
          ) : errorMessage ? (
            <View style={[styles.statusCard, styles.errorCard]}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroIconCircle}>
                  <Banknote color={Palette.primary} size={26} strokeWidth={2.25} />
                </View>
                <PayoutStatusPill status={status} />
                <Text style={styles.heroTitle}>{t(STATUS_TITLE[status])}</Text>
                <Text style={styles.heroDescription}>{t(STATUS_DESCRIPTION[status])}</Text>
              </View>

              {!isActive ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ busy: payoutAccountMutation.isPending }}
                  disabled={payoutAccountMutation.isPending}
                  onPress={() => {
                    void handleStartOnboarding();
                  }}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    pressed && styles.actionPressed,
                    payoutAccountMutation.isPending && styles.actionDisabled,
                  ]}
                >
                  {payoutAccountMutation.isPending ? (
                    <ActivityIndicator color={Palette.textOnPrimary} size="small" />
                  ) : (
                    <ExternalLink color={Palette.textOnPrimary} size={18} />
                  )}
                  <Text style={styles.primaryActionText}>
                    {status === 'pending'
                      ? t('wallet.payout.detail.continueOnboarding')
                      : t('wallet.payout.detail.startOnboarding')}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/wallet/withdraw')}
                  style={({ pressed }) => [styles.primaryAction, pressed && styles.actionPressed]}
                >
                  <Text style={styles.primaryActionText}>{t('wallet.withdraw.cta')}</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Toast
        kind={toast?.kind ?? 'error'}
        message={toast?.message ?? ''}
        onDismiss={dismissToast}
        visible={toast !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 48,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    gap: Spacing.lg,
  },
  heroCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.cardSoft,
  },
  heroIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  heroTitle: {
    ...Typography.titleSmall,
    color: Palette.text,
    textAlign: 'center',
  },
  heroDescription: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 52,
    borderRadius: Radii.md,
    backgroundColor: Palette.primary,
    paddingHorizontal: Spacing.lg,
  },
  primaryActionText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  statusCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 70,
  },
  loadingText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  errorCard: {
    borderColor: Palette.danger,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.base,
  },
});
