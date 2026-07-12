import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Circle, Eye, EyeOff } from 'lucide-react-native';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { SignUpSchema, type SignUpInput } from '@/features/auth/schemas';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { translateZodMessage } from '@/shared/utils/zod-error-map';

export type SignUpFormSubmitValues = SignUpInput & { rememberMe: boolean };

type Props = {
  onSubmit: (data: SignUpFormSubmitValues) => Promise<void> | void;
  formError?: string | null;
  initialRememberMe?: boolean;
};

export function SignUpForm({ onSubmit, formError, initialRememberMe = false }: Props) {
  const { t } = useTranslation();
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(initialRememberMe);

  const form = useForm<SignUpInput>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
    mode: 'onSubmit',
  });

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit({ ...data, rememberMe });
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <View style={{ width: '100%', gap: Spacing.lg }}>
      <Controller
        control={form.control}
        name="fullName"
        render={({ field, fieldState }) => (
          <View style={formStyles.field}>
            <TextInput
              style={[formStyles.input, fieldState.error && formStyles.inputError]}
              placeholder={t('auth.createProfile.fullName.placeholder')}
              placeholderTextColor={Palette.textSecondary}
              autoCapitalize="words"
              autoCorrect={false}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              editable={!isSubmitting}
            />
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
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              editable={!isSubmitting}
            />
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
        name="password"
        render={({ field, fieldState }) => (
          <View style={formStyles.field}>
            <View style={formStyles.passwordFieldWrapper}>
              <TextInput
                style={[
                  formStyles.input,
                  formStyles.inputWithIcon,
                  fieldState.error && formStyles.inputError,
                ]}
                placeholder={t('auth.password.placeholder')}
                placeholderTextColor={Palette.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!isPasswordVisible}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                editable={!isSubmitting}
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
                style={[
                  formStyles.input,
                  formStyles.inputWithIcon,
                  fieldState.error && formStyles.inputError,
                ]}
                placeholder={t('auth.password.placeholder')}
                placeholderTextColor={Palette.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!isConfirmVisible}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                editable={!isSubmitting}
                onSubmitEditing={() => {
                  void handleSubmit();
                }}
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

      <Pressable
        onPress={() => setRememberMe((v) => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingVertical: Spacing.xs,
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: rememberMe }}
      >
        {rememberMe ? (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: Palette.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check color={Palette.textOnPrimary} size={14} strokeWidth={3} />
          </View>
        ) : (
          <Circle color={Palette.textSecondary} size={22} />
        )}
        <Text style={{ color: Palette.text, fontSize: FontSize.md, fontWeight: FontWeight.medium }}>
          {t('auth.signIn.rememberMe')}
        </Text>
      </Pressable>

      {formError ? <Text style={formStyles.formError}>{formError}</Text> : null}

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
          <Text style={formStyles.primaryButtonText}>{t('auth.signup.button')}</Text>
        )}
      </Pressable>
    </View>
  );
}
