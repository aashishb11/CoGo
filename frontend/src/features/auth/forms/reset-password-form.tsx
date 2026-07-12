import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { ResetPasswordSchema, type ResetPasswordInput } from '@/features/auth/schemas';
import { Palette, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { translateZodMessage } from '@/shared/utils/zod-error-map';

type Props = {
  onSubmit: (data: ResetPasswordInput) => Promise<void> | void;
  formError?: string | null;
};

export function ResetPasswordForm({ onSubmit, formError }: Props) {
  const { t } = useTranslation();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onSubmit',
  });

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data);
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <View style={{ width: '100%', gap: Spacing.lg }}>
      <Controller
        control={form.control}
        name="password"
        render={({ field, fieldState }) => (
          <View style={formStyles.field}>
            <View style={formStyles.passwordFieldWrapper}>
              <TextInput
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                editable={!isSubmitting}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder={t('auth.password.placeholder')}
                placeholderTextColor={Palette.textSecondary}
                secureTextEntry={!isPasswordVisible}
                style={[
                  formStyles.input,
                  formStyles.inputWithIcon,
                  fieldState.error && formStyles.inputError,
                ]}
                value={field.value}
              />
              <Pressable
                accessibilityLabel={
                  isPasswordVisible
                    ? t('auth.password.toggle.hide')
                    : t('auth.password.toggle.show')
                }
                hitSlop={10}
                onPress={() => setIsPasswordVisible((v) => !v)}
                style={formStyles.passwordToggle}
              >
                {isPasswordVisible ? (
                  <EyeOff color={Palette.textSecondary} size={22} />
                ) : (
                  <Eye color={Palette.textSecondary} size={22} />
                )}
              </Pressable>
            </View>
            {fieldState.error ? (
              <Text style={formStyles.errorText}>
                {translateZodMessage(fieldState.error.message)}
              </Text>
            ) : null}
          </View>
        )}
      />

      <Controller
        control={form.control}
        name="confirmPassword"
        render={({ field, fieldState }) => (
          <View style={formStyles.field}>
            <View style={formStyles.passwordFieldWrapper}>
              <TextInput
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                editable={!isSubmitting}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                onSubmitEditing={() => {
                  void handleSubmit();
                }}
                placeholder={t('auth.password.confirmPlaceholder')}
                placeholderTextColor={Palette.textSecondary}
                secureTextEntry={!isConfirmVisible}
                style={[
                  formStyles.input,
                  formStyles.inputWithIcon,
                  fieldState.error && formStyles.inputError,
                ]}
                value={field.value}
              />
              <Pressable
                accessibilityLabel={
                  isConfirmVisible ? t('auth.password.toggle.hide') : t('auth.password.toggle.show')
                }
                hitSlop={10}
                onPress={() => setIsConfirmVisible((v) => !v)}
                style={formStyles.passwordToggle}
              >
                {isConfirmVisible ? (
                  <EyeOff color={Palette.textSecondary} size={22} />
                ) : (
                  <Eye color={Palette.textSecondary} size={22} />
                )}
              </Pressable>
            </View>
            {fieldState.error ? (
              <Text style={formStyles.errorText}>
                {translateZodMessage(fieldState.error.message)}
              </Text>
            ) : null}
          </View>
        )}
      />

      {formError ? <Text style={formStyles.formError}>{formError}</Text> : null}

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
            <Text style={formStyles.primaryButtonText}>{t('auth.resetPassword.loading')}</Text>
          </View>
        ) : (
          <Text style={formStyles.primaryButtonText}>{t('auth.resetPassword.submit')}</Text>
        )}
      </Pressable>
    </View>
  );
}
