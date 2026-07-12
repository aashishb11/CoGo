import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { ForgotPasswordSchema, type ForgotPasswordInput } from '@/features/auth/schemas';
import { Palette, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { translateZodMessage } from '@/shared/utils/zod-error-map';

type Props = {
  onSubmit: (data: ForgotPasswordInput) => Promise<void> | void;
  formError?: string | null;
  successMessage?: string | null;
  defaultValues?: Partial<ForgotPasswordInput>;
};

export function ForgotPasswordForm({ onSubmit, formError, successMessage, defaultValues }: Props) {
  const { t } = useTranslation();

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '', ...defaultValues },
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
        name="email"
        render={({ field, fieldState }) => (
          <View style={formStyles.field}>
            <TextInput
              style={[formStyles.input, fieldState.error && formStyles.inputError]}
              placeholder={t('auth.email.placeholder')}
              placeholderTextColor={Palette.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="go"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              editable={!isSubmitting}
              onSubmitEditing={() => {
                void handleSubmit();
              }}
            />
            {fieldState.error ? (
              <Text style={formStyles.errorText}>
                {translateZodMessage(fieldState.error.message)}
              </Text>
            ) : null}
          </View>
        )}
      />

      {formError ? <Text style={formStyles.formError}>{formError}</Text> : null}
      {successMessage ? (
        <Text style={[formStyles.formError, { color: Palette.success }]}>{successMessage}</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void handleSubmit();
        }}
        disabled={isSubmitting}
        style={({ pressed }) => [
          formStyles.primaryButton,
          pressed && !isSubmitting && formStyles.primaryButtonPressed,
          isSubmitting && formStyles.primaryButtonDisabled,
        ]}
      >
        {isSubmitting ? (
          <ActivityIndicator color={Palette.textOnPrimary} size="small" />
        ) : (
          <Text style={formStyles.primaryButtonText}>{t('auth.forgotPassword.submit')}</Text>
        )}
      </Pressable>
    </View>
  );
}
