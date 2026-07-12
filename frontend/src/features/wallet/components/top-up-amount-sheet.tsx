import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { z } from 'zod';

import { formatCents } from '@/features/wallet/format';
import {
  TOP_UP_PRESETS_CENTS,
  TopUpFormSchema,
  type TopUpFormOutput,
} from '@/features/wallet/schemas';
import { toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { BottomDrawer } from '@/shared/ui/components/bottom-drawer';
import { translateZodMessage } from '@/shared/utils/zod-error-map';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (amountCents: number) => Promise<void> | void;
  isSubmitting: boolean;
};

export function TopUpAmountSheet({ visible, onClose, onSubmit, isSubmitting }: Props) {
  const { t, i18n } = useTranslation();
  const lang = toLang(i18n.resolvedLanguage ?? i18n.language) ?? 'en';

  const form = useForm<z.input<typeof TopUpFormSchema>, unknown, TopUpFormOutput>({
    resolver: zodResolver(TopUpFormSchema),
    defaultValues: { amount: '' },
    mode: 'onSubmit',
  });

  // Each open/close cycle starts from a clean amount so the same chip can be
  // re-selected and the previous error doesn't linger.
  useEffect(() => {
    if (visible) {
      form.reset({ amount: '' });
    }
  }, [visible, form]);

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data.amount);
  });

  function applyPreset(cents: number) {
    const euros = (cents / 100).toFixed(2);
    form.setValue('amount', euros, { shouldValidate: false });
    form.clearErrors('amount');
  }

  const presets = useMemo(() => Array.from(TOP_UP_PRESETS_CENTS), []);

  return (
    <BottomDrawer
      accessibilityLabel={t('wallet.topUp.title')}
      onClose={onClose}
      title={t('wallet.topUp.title')}
      visible={visible}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.body}>
          <Text style={styles.description}>{t('wallet.topUp.description')}</Text>

          <View style={styles.presetGrid}>
            {presets.map((cents) => (
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                key={cents}
                onPress={() => applyPreset(cents)}
                style={({ pressed }) => [
                  styles.presetChip,
                  pressed && styles.presetChipPressed,
                  isSubmitting && styles.presetChipDisabled,
                ]}
              >
                <Text style={styles.presetText}>{formatCents(cents, lang)}</Text>
              </Pressable>
            ))}
          </View>

          <Controller
            control={form.control}
            name="amount"
            render={({ field, fieldState }) => (
              <View style={formStyles.field}>
                <Text style={formStyles.label}>{t('wallet.topUp.amountLabel')}</Text>
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
                  <Text style={styles.hint}>{t('wallet.topUp.bounds')}</Text>
                )}
              </View>
            )}
          />

          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => {
              void handleSubmit();
            }}
            style={({ pressed }) => [
              formStyles.primaryButton,
              pressed && !isSubmitting && formStyles.primaryButtonPressed,
              isSubmitting && formStyles.primaryButtonDisabled,
            ]}
          >
            {isSubmitting ? (
              <View style={formStyles.loadingRow}>
                <ActivityIndicator color={Palette.textOnPrimary} size="small" />
                <Text style={formStyles.primaryButtonText}>{t('wallet.topUp.submitting')}</Text>
              </View>
            ) : (
              <Text style={formStyles.primaryButtonText}>{t('wallet.topUp.submit')}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  description: {
    color: Palette.textSecondary,
    fontSize: FontSize.base,
    lineHeight: 18,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  presetChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  presetChipPressed: {
    opacity: 0.85,
  },
  presetChipDisabled: {
    opacity: 0.55,
  },
  presetText: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  hint: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
