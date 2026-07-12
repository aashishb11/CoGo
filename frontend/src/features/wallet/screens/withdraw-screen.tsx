import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { ArrowUpFromLine } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { formatCents } from '@/features/wallet/format';
import { useCreateWithdrawal, useWallet } from '@/features/wallet/queries';
import {
  createWithdrawSchema,
  type WithdrawFormInput,
  type WithdrawFormOutput,
} from '@/features/wallet/schemas';
import type { WalletTransactionStatus } from '@/features/wallet/types';
import { getErrorCode, mapErrorToMessageKey } from '@/shared/api';
import { toLang, type TextKey } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { Toast, type ToastKind } from '@/shared/ui/components/toast';
import { translateZodMessage } from '@/shared/utils/zod-error-map';

type ToastState = { kind: ToastKind; message: string } | null;

const STATUS_LABEL_KEY: Record<WalletTransactionStatus, TextKey> = {
  completed: 'wallet.withdraw.result.completed',
  pending: 'wallet.withdraw.result.pending',
  failed: 'wallet.withdraw.result.failed',
};

export default function WithdrawScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const lang = toLang(i18n.resolvedLanguage ?? i18n.language) ?? 'en';

  const session = useRequireAuth();
  const userId = session.data?.user?.id ?? null;

  const walletQuery = useWallet(userId);
  const wallet = walletQuery.data ?? null;
  const withdrawMutation = useCreateWithdrawal(userId);

  const [toast, setToast] = useState<ToastState>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const availableCents = wallet?.availableCents ?? 0;
  const payoutStatus = wallet?.payoutStatus ?? 'none';
  const isPayoutReady = payoutStatus === 'active';

  // The schema is parameterized by the current available balance so the
  // "amount exceeds balance" check fires before we round-trip to the backend.
  const schema = useMemo(() => createWithdrawSchema(availableCents), [availableCents]);

  const form = useForm<WithdrawFormInput, unknown, WithdrawFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { amount: '' },
    mode: 'onSubmit',
  });

  const handleSubmit = form.handleSubmit(async (data) => {
    if (!isPayoutReady) {
      setToast({ kind: 'error', message: t('wallet.withdraw.error.notReady') });
      return;
    }
    try {
      const result = await withdrawMutation.mutateAsync(data.amount);
      const label = t(STATUS_LABEL_KEY[result.status]);
      if (result.status === 'failed') {
        setToast({ kind: 'error', message: label });
        return;
      }
      setToast({ kind: 'success', message: label });
      form.reset({ amount: '' });
      // Bounce back to the wallet so the new debit row is visible.
      router.replace('/wallet');
    } catch (error) {
      const code = getErrorCode(error);
      if (code === 'PAYOUT_ACCOUNT_NOT_READY') {
        setToast({ kind: 'error', message: t('wallet.withdraw.error.notReady') });
        return;
      }
      if (code === 'INSUFFICIENT_WALLET_BALANCE') {
        setToast({ kind: 'error', message: t('wallet.withdraw.error.insufficient') });
        return;
      }
      setToast({ kind: 'error', message: t(mapErrorToMessageKey(error)) });
    }
  });

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/wallet');
  }

  function applyMax() {
    if (availableCents <= 0) return;
    const euros = (availableCents / 100).toFixed(2);
    form.setValue('amount', euros, { shouldValidate: false });
    form.clearErrors('amount');
  }

  const isSubmitting = withdrawMutation.isPending || form.formState.isSubmitting;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack, accessibilityLabel: t('viewProfile.back') }}
        subtitle={t('wallet.withdraw.subtitle')}
        title={t('wallet.withdraw.title')}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.balanceCard}>
              <View style={styles.balanceIconCircle}>
                <ArrowUpFromLine color={Palette.primary} size={22} strokeWidth={2.25} />
              </View>
              <Text style={styles.balanceLabel}>{t('wallet.withdraw.availableLabel')}</Text>
              <Text style={styles.balanceAmount}>{formatCents(availableCents, lang)}</Text>
            </View>

            {!isPayoutReady ? (
              <View style={styles.warningCard}>
                <Text style={styles.warningTitle}>{t('wallet.withdraw.error.notReady')}</Text>
                <Text style={styles.warningDescription}>
                  {t('wallet.withdraw.notReadyDescription')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace('/wallet/payout-account')}
                  style={({ pressed }) => [styles.warningCta, pressed && styles.actionPressed]}
                >
                  <Text style={styles.warningCtaText}>
                    {t('wallet.payout.detail.startOnboarding')}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Controller
              control={form.control}
              name="amount"
              render={({ field, fieldState }) => (
                <View style={formStyles.field}>
                  <View style={styles.amountLabelRow}>
                    <Text style={formStyles.label}>{t('wallet.withdraw.amountLabel')}</Text>
                    <Pressable
                      accessibilityRole="button"
                      disabled={availableCents <= 0 || isSubmitting}
                      hitSlop={6}
                      onPress={applyMax}
                    >
                      <Text style={styles.maxLink}>{t('wallet.withdraw.useMax')}</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    editable={!isSubmitting}
                    keyboardType="decimal-pad"
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    placeholder={t('wallet.amount.placeholder')}
                    placeholderTextColor={Palette.textSecondary}
                    style={[formStyles.input, fieldState.error && formStyles.inputError]}
                    value={field.value ?? ''}
                  />
                  {fieldState.error ? (
                    <Text style={formStyles.errorText}>
                      {translateZodMessage(fieldState.error.message)}
                    </Text>
                  ) : (
                    <Text style={styles.hint}>{t('wallet.withdraw.hint')}</Text>
                  )}
                </View>
              )}
            />

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting || !isPayoutReady || availableCents <= 0}
              onPress={() => {
                void handleSubmit();
              }}
              style={({ pressed }) => [
                formStyles.primaryButton,
                pressed && !isSubmitting && formStyles.primaryButtonPressed,
                (isSubmitting || !isPayoutReady || availableCents <= 0) &&
                  formStyles.primaryButtonDisabled,
              ]}
            >
              {isSubmitting ? (
                <View style={formStyles.loadingRow}>
                  <ActivityIndicator color={Palette.textOnPrimary} size="small" />
                  <Text style={formStyles.primaryButtonText}>
                    {t('wallet.withdraw.submitting')}
                  </Text>
                </View>
              ) : (
                <Text style={formStyles.primaryButtonText}>{t('wallet.withdraw.submit')}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
  flex: {
    flex: 1,
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
  balanceCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    ...Shadow.cardSoft,
  },
  balanceIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  balanceLabel: {
    ...Typography.label,
    color: Palette.textSecondary,
    marginBottom: 4,
  },
  balanceAmount: {
    ...Typography.title,
    color: Palette.text,
  },
  warningCard: {
    backgroundColor: Palette.warningSurface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.warning,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  warningTitle: {
    color: Palette.warning,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  warningDescription: {
    color: Palette.text,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    lineHeight: 18,
  },
  warningCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    backgroundColor: Palette.primary,
  },
  warningCtaText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  amountLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  maxLink: {
    color: Palette.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  hint: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  actionPressed: {
    opacity: 0.85,
  },
});
