import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  ChevronRight,
  ExternalLink,
  Wallet,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
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
import { TopUpAmountSheet } from '@/features/wallet/components/top-up-amount-sheet';
import { TransactionRow } from '@/features/wallet/components/transaction-row';
import { formatCents } from '@/features/wallet/format';
import {
  useCreatePayoutAccount,
  useCreateTopUp,
  useInvalidateWallet,
  useWallet,
} from '@/features/wallet/queries';
import type { PayoutStatus } from '@/features/wallet/types';
import { mapErrorToMessageKey } from '@/shared/api';
import { env } from '@/shared/env';
import { toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { Toast, type ToastKind } from '@/shared/ui/components/toast';

type ToastState = { kind: ToastKind; message: string } | null;

function getCalloutTitle(status: PayoutStatus): {
  titleKey:
    | 'wallet.payout.callout.none.title'
    | 'wallet.payout.callout.pending.title'
    | 'wallet.payout.callout.restricted.title';
  descriptionKey:
    | 'wallet.payout.callout.none.description'
    | 'wallet.payout.callout.pending.description'
    | 'wallet.payout.callout.restricted.description';
} {
  if (status === 'pending') {
    return {
      titleKey: 'wallet.payout.callout.pending.title',
      descriptionKey: 'wallet.payout.callout.pending.description',
    };
  }
  if (status === 'restricted') {
    return {
      titleKey: 'wallet.payout.callout.restricted.title',
      descriptionKey: 'wallet.payout.callout.restricted.description',
    };
  }
  return {
    titleKey: 'wallet.payout.callout.none.title',
    descriptionKey: 'wallet.payout.callout.none.description',
  };
}

export default function WalletScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const lang = toLang(i18n.resolvedLanguage ?? i18n.language) ?? 'en';

  const session = useRequireAuth();
  const userId = session.data?.user?.id ?? null;

  const walletQuery = useWallet(userId);
  const wallet = walletQuery.data ?? null;
  const invalidateWallet = useInvalidateWallet(userId);

  const topUpMutation = useCreateTopUp(userId);
  const payoutAccountMutation = useCreatePayoutAccount(userId);

  const [topUpSheetVisible, setTopUpSheetVisible] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const dismissToast = useCallback(() => setToast(null), []);

  // `refetch` is a stable function from TanStack Query (the wrapping query
  // object isn't). Pulling it out keeps useFocusEffect's dep array stable
  // so it doesn't re-subscribe on every render and trigger churn.
  const refetchWallet = walletQuery.refetch;

  // Re-pull on focus so returning from Stripe Checkout / Connect onboarding
  // surfaces the new transaction or status without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void refetchWallet();
    }, [refetchWallet, userId]),
  );

  // Drive RefreshControl from this state — not `query.isRefetching` — so the
  // focus-effect refetch above doesn't flash the spinner on screen entry.
  const handlePullToRefresh = useCallback(async () => {
    setIsManualRefresh(true);
    try {
      await refetchWallet();
    } finally {
      setIsManualRefresh(false);
    }
  }, [refetchWallet]);

  const isLoading = session.isPending || (userId !== null && walletQuery.isLoading);
  const errorMessage =
    walletQuery.error && !walletQuery.isRefetching
      ? t(mapErrorToMessageKey(walletQuery.error))
      : '';

  const payoutStatus: PayoutStatus = wallet?.payoutStatus ?? 'none';
  const isPayoutActive = payoutStatus === 'active';
  const availableCents = wallet?.availableCents ?? 0;
  const heldCents = wallet?.heldCents ?? 0;
  const balanceCents = wallet?.balanceCents ?? 0;

  const callout = useMemo(() => getCalloutTitle(payoutStatus), [payoutStatus]);

  const recentTransactions = wallet?.recentTransactions ?? [];

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/profile');
  }

  function handleOpenTransactions() {
    router.push('/wallet/transactions');
  }

  function handleOpenWithdraw() {
    if (!isPayoutActive) return;
    router.push('/wallet/withdraw');
  }

  async function handleTopUpSubmit(amountCents: number) {
    try {
      const result = await topUpMutation.mutateAsync(amountCents);
      setTopUpSheetVisible(false);
      // openAuthSessionAsync handles the `cogo://wallet` deep-link return
      // automatically — it resolves once the browser is closed or the
      // configured redirect is reached. Either way we re-pull the wallet so
      // the pending top-up surfaces.
      await WebBrowser.openAuthSessionAsync(result.checkoutUrl, 'cogo://wallet');
      invalidateWallet();
    } catch (error) {
      setTopUpSheetVisible(false);
      setToast({ kind: 'error', message: t(mapErrorToMessageKey(error)) });
    }
  }

  async function handleStartOnboarding() {
    try {
      const result = await payoutAccountMutation.mutateAsync();
      // Stripe Connect's accountLinks API rejects custom-scheme return URLs,
      // so onboarding bounces back to a backend bounce page. WebBrowser
      // closes on the URL match; the wallet refetches on focus.
      await WebBrowser.openAuthSessionAsync(
        result.onboardingUrl,
        `${env.EXPO_PUBLIC_API_BASE_URL}/api/wallet/connect-return`,
      );
      invalidateWallet();
    } catch (error) {
      setToast({ kind: 'error', message: t(mapErrorToMessageKey(error)) });
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack, accessibilityLabel: t('viewProfile.back') }}
        subtitle={t('wallet.subtitle')}
        title={t('wallet.title')}
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
          {isLoading ? (
            <View style={[styles.statusCard, styles.loadingRow]}>
              <ActivityIndicator color={Palette.primary} size="small" />
              <Text style={styles.loadingText}>{t('wallet.loading')}</Text>
            </View>
          ) : errorMessage ? (
            <View style={[styles.statusCard, styles.errorCard]}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroIconCircle}>
                  <Wallet color={Palette.primary} size={26} strokeWidth={2.25} />
                </View>
                <Text style={styles.heroLabel}>{t('wallet.balance.availableLabel')}</Text>
                <Text style={styles.heroAmount}>{formatCents(availableCents, lang)}</Text>
                <View style={styles.heroBreakdown}>
                  <View style={styles.heroBreakdownRow}>
                    <Text style={styles.heroBreakdownKey}>{t('wallet.balance.totalLabel')}</Text>
                    <Text style={styles.heroBreakdownValue}>{formatCents(balanceCents, lang)}</Text>
                  </View>
                  <View style={styles.heroBreakdownRow}>
                    <Text style={styles.heroBreakdownKey}>{t('wallet.balance.heldLabel')}</Text>
                    <Text style={styles.heroBreakdownValue}>{formatCents(heldCents, lang)}</Text>
                  </View>
                </View>
                <View style={styles.heroActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setTopUpSheetVisible(true)}
                    style={({ pressed }) => [styles.primaryAction, pressed && styles.actionPressed]}
                  >
                    <ArrowDownToLine color={Palette.textOnPrimary} size={18} />
                    <Text style={styles.primaryActionText}>{t('wallet.topUp.cta')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !isPayoutActive }}
                    disabled={!isPayoutActive}
                    onPress={handleOpenWithdraw}
                    style={({ pressed }) => [
                      styles.secondaryAction,
                      pressed && isPayoutActive && styles.actionPressed,
                      !isPayoutActive && styles.actionDisabled,
                    ]}
                  >
                    <ArrowUpFromLine color={Palette.text} size={18} />
                    <Text style={styles.secondaryActionText}>{t('wallet.withdraw.cta')}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionLabel}>{t('wallet.payout.sectionLabel')}</Text>
                  <PayoutStatusPill status={payoutStatus} />
                </View>
                {isPayoutActive ? (
                  <View style={styles.activeCard}>
                    <View style={styles.activeCardIconCircle}>
                      <Banknote color={Palette.success} size={20} strokeWidth={2.25} />
                    </View>
                    <View style={styles.activeCardBody}>
                      <Text style={styles.activeCardTitle}>{t('wallet.payout.active.title')}</Text>
                      <Text style={styles.activeCardDescription}>
                        {t('wallet.payout.active.description')}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ busy: payoutAccountMutation.isPending }}
                    disabled={payoutAccountMutation.isPending}
                    onPress={() => {
                      void handleStartOnboarding();
                    }}
                    style={({ pressed }) => [
                      styles.calloutCard,
                      pressed && styles.linkRowPressed,
                      payoutAccountMutation.isPending && styles.actionDisabled,
                    ]}
                  >
                    <View style={styles.calloutIconCircle}>
                      <ExternalLink color={Palette.primary} size={20} strokeWidth={2.25} />
                    </View>
                    <View style={styles.calloutBody}>
                      <Text style={styles.calloutTitle}>{t(callout.titleKey)}</Text>
                      <Text style={styles.calloutDescription}>{t(callout.descriptionKey)}</Text>
                    </View>
                    {payoutAccountMutation.isPending ? (
                      <ActivityIndicator color={Palette.primary} size="small" />
                    ) : (
                      <ChevronRight color={Palette.textSecondary} size={18} />
                    )}
                  </Pressable>
                )}
              </View>

              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionLabel}>{t('wallet.recentTransactions.title')}</Text>
                  {recentTransactions.length > 0 ? (
                    <Pressable
                      accessibilityRole="link"
                      hitSlop={6}
                      onPress={handleOpenTransactions}
                    >
                      <Text style={styles.linkText}>{t('wallet.recentTransactions.seeAll')}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {recentTransactions.length === 0 ? (
                  <View style={styles.statusCard}>
                    <Text style={styles.emptyText}>{t('wallet.recentTransactions.empty')}</Text>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleOpenTransactions}
                    style={({ pressed }) => [
                      styles.transactionsCard,
                      pressed && styles.linkRowPressed,
                    ]}
                  >
                    {recentTransactions.map((tx, index) => (
                      <View key={tx.id}>
                        <TransactionRow transaction={tx} />
                        {index < recentTransactions.length - 1 ? (
                          <View style={styles.rowDivider} />
                        ) : null}
                      </View>
                    ))}
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <TopUpAmountSheet
        isSubmitting={topUpMutation.isPending}
        onClose={() => setTopUpSheetVisible(false)}
        onSubmit={handleTopUpSubmit}
        visible={topUpSheetVisible}
      />

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
  heroLabel: {
    ...Typography.label,
    color: Palette.textSecondary,
    marginBottom: 4,
  },
  heroAmount: {
    ...Typography.display,
    color: Palette.text,
    marginBottom: Spacing.md,
  },
  heroBreakdown: {
    width: '100%',
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
    paddingTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  heroBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroBreakdownKey: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  heroBreakdownValue: {
    color: Palette.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  heroActions: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.sm,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    borderRadius: Radii.md,
    backgroundColor: Palette.primary,
    paddingHorizontal: Spacing.md,
  },
  primaryActionText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  secondaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
    paddingHorizontal: Spacing.md,
  },
  secondaryActionText: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
  },
  sectionLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  linkText: {
    color: Palette.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  calloutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Palette.primarySurface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.cardSoft,
  },
  calloutIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  calloutTitle: {
    color: Palette.primaryDark,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  calloutDescription: {
    color: Palette.primaryDark,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    opacity: 0.8,
  },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Palette.successSurface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.success,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.cardSoft,
  },
  activeCardIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  activeCardTitle: {
    color: Palette.success,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  activeCardDescription: {
    color: Palette.success,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    opacity: 0.85,
  },
  transactionsCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    ...Shadow.cardSoft,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Palette.border,
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
  emptyText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  errorCard: {
    borderColor: Palette.danger,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.base,
  },
  linkRowPressed: {
    opacity: 0.85,
  },
});
