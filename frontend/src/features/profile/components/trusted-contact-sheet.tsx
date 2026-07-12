import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react-native';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { z } from 'zod';

import type { TrustedContact } from '@/features/profile/api';
import { useUpsertTrustedContact } from '@/features/profile/queries';
import { TrustedContactSchema } from '@/features/profile/schemas';
import { mapErrorToMessageKey } from '@/shared/api';
import { FontSize, FontWeight, Palette, Spacing, Typography } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { BottomDrawer } from '@/shared/ui/components/bottom-drawer';

type TrustedContactSheetProps = {
  contact?: TrustedContact | null;
  onClose: () => void;
  onSaved?: (contact: TrustedContact | null) => void | Promise<void>;
  visible: boolean;
};

type TrustedContactFormValues = z.input<typeof TrustedContactSchema>;

export function TrustedContactSheet({
  contact,
  onClose,
  onSaved,
  visible,
}: TrustedContactSheetProps) {
  const { t } = useTranslation();
  const mutation = useUpsertTrustedContact();
  const resetMutation = mutation.reset;
  const form = useForm<TrustedContactFormValues>({
    resolver: zodResolver(TrustedContactSchema),
    defaultValues: {
      name: contact?.name ?? '',
      email: contact?.email ?? '',
    },
    mode: 'onSubmit',
  });

  useEffect(() => {
    if (!visible) return;
    resetMutation();
    form.reset({
      name: contact?.name ?? '',
      email: contact?.email ?? '',
    });
  }, [contact?.email, contact?.name, form, resetMutation, visible]);

  const submit = form.handleSubmit(async (values) => {
    const saved = await mutation.mutateAsync(values);
    await onSaved?.(saved);
    onClose();
  });

  return (
    <BottomDrawer drawerStyle={styles.sheet} onClose={onClose} visible={visible}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{t('profile.trustedContact.title')}</Text>
          <Text style={styles.subtitle}>{t('profile.trustedContact.subtitle')}</Text>
        </View>
        <Pressable
          accessibilityLabel={t('common.action.close')}
          accessibilityRole="button"
          disabled={mutation.isPending}
          hitSlop={10}
          onPress={onClose}
          style={styles.closeButton}
        >
          <X color={Palette.textSecondary} size={20} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <View style={formStyles.field}>
              <Text style={formStyles.label}>{t('profile.trustedContact.name')}</Text>
              <TextInput
                autoCapitalize="words"
                editable={!mutation.isPending}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder={t('profile.trustedContact.name')}
                placeholderTextColor={Palette.textSecondary}
                style={[formStyles.input, fieldState.error && formStyles.inputError]}
                value={field.value ?? ''}
              />
              {fieldState.error ? (
                <Text style={formStyles.errorText}>{t('common.error.validation')}</Text>
              ) : null}
            </View>
          )}
        />

        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <View style={formStyles.field}>
              <Text style={formStyles.label}>{t('profile.trustedContact.email')}</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!mutation.isPending}
                keyboardType="email-address"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder="name@example.com"
                placeholderTextColor={Palette.textSecondary}
                style={[formStyles.input, fieldState.error && formStyles.inputError]}
                value={field.value ?? ''}
              />
              {fieldState.error ? (
                <Text style={formStyles.errorText}>{t('auth.email.invalid')}</Text>
              ) : null}
            </View>
          )}
        />

        {mutation.error ? (
          <Text style={formStyles.formError}>{t(mapErrorToMessageKey(mutation.error))}</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={mutation.isPending}
          onPress={onClose}
          style={({ pressed }) => [
            formStyles.secondaryButton,
            pressed && !mutation.isPending ? styles.pressed : null,
            mutation.isPending && formStyles.primaryButtonDisabled,
          ]}
        >
          <Text style={formStyles.secondaryButtonText}>{t('joinTrip.modal.cancel')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: mutation.isPending, disabled: mutation.isPending }}
          disabled={mutation.isPending}
          onPress={() => {
            void submit();
          }}
          style={({ pressed }) => [
            formStyles.primaryButton,
            pressed && !mutation.isPending ? formStyles.primaryButtonPressed : null,
            mutation.isPending && formStyles.primaryButtonDisabled,
          ]}
        >
          {mutation.isPending ? (
            <View style={formStyles.loadingRow}>
              <ActivityIndicator color={Palette.textOnPrimary} size="small" />
              <Text style={formStyles.primaryButtonText}>{t('profile.trustedContact.saving')}</Text>
            </View>
          ) : (
            <Text style={formStyles.primaryButtonText}>{t('profile.trustedContact.save')}</Text>
          )}
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '86%',
    backgroundColor: Palette.background,
    paddingHorizontal: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...Typography.titleSmall,
    color: Palette.text,
  },
  subtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    lineHeight: 20,
    marginTop: 3,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  footer: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  pressed: {
    opacity: 0.86,
  },
});
