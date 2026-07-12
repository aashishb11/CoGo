import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { CreateProfileSchema, type CreateProfileInput } from '@/features/profile/schemas';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import LanguageSwitcher from '@/shared/ui/language-switcher';
import { translateZodMessage } from '@/shared/utils/zod-error-map';

const BIO_MAX_LENGTH = 180;

type ProfileFormDefaults = {
  username?: string;
  bio?: string;
  phone?: string;
  locale?: Lang;
};

type Props = {
  onSubmit: (data: CreateProfileInput) => Promise<void> | void;
  defaultValues?: ProfileFormDefaults;
  submitLabel?: string;
  loadingLabel?: string;
  formError?: string | null;
  compactLocaleField?: boolean;
  compactLocaleSwitcher?: boolean;
};

export function ProfileForm({
  onSubmit,
  defaultValues,
  submitLabel,
  loadingLabel,
  formError,
  compactLocaleField = false,
  compactLocaleSwitcher = true,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;

  const form = useForm<z.input<typeof CreateProfileSchema>, unknown, CreateProfileInput>({
    resolver: zodResolver(CreateProfileSchema),
    defaultValues: {
      username: defaultValues?.username ?? '',
      bio: defaultValues?.bio ?? '',
      phone: defaultValues?.phone ?? '',
      locale: defaultValues?.locale ?? lang,
    },
    mode: 'onSubmit',
  });

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data);
  });

  const bioValue = form.watch('bio') ?? '';
  const isSubmitting = form.formState.isSubmitting;

  return (
    <View style={{ width: '100%', gap: Spacing.lg }}>
      <Controller
        control={form.control}
        name="username"
        render={({ field, fieldState }) => (
          <View style={formStyles.field}>
            <Text style={formStyles.label}>{t('viewProfile.field.username')}</Text>
            <TextInput
              style={[formStyles.input, fieldState.error && formStyles.inputError]}
              placeholder={t('auth.createProfile.username.placeholder')}
              placeholderTextColor={Palette.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              value={field.value ?? ''}
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
        name="bio"
        render={({ field }) => (
          <View style={formStyles.field}>
            <Text style={formStyles.label}>{t('viewProfile.field.bio')}</Text>
            <TextInput
              style={[formStyles.input, formStyles.inputMultiline]}
              placeholder={t('auth.createProfile.bio.placeholder')}
              placeholderTextColor={Palette.textSecondary}
              autoCapitalize="sentences"
              multiline
              numberOfLines={4}
              value={field.value ?? ''}
              onChangeText={(v) => {
                if (v.length <= BIO_MAX_LENGTH) {
                  field.onChange(v);
                }
              }}
              onBlur={field.onBlur}
              editable={!isSubmitting}
            />
            <Text
              style={{
                alignSelf: 'flex-end',
                fontSize: FontSize.sm,
                fontWeight: FontWeight.medium,
                color: Palette.textSecondary,
              }}
            >
              {String(bioValue).length}/{BIO_MAX_LENGTH}
            </Text>
          </View>
        )}
      />

      <Controller
        control={form.control}
        name="locale"
        render={({ field, fieldState }) => (
          <View style={[formStyles.field, compactLocaleField && styles.localeFieldCompact]}>
            <Text style={formStyles.label}>{t('viewProfile.field.locale')}</Text>
            <LanguageSwitcher
              compact={compactLocaleSwitcher}
              absolute={false}
              value={toLang(field.value) ?? lang}
              onChange={(nextLang) => field.onChange(nextLang)}
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
        name="phone"
        render={({ field, fieldState }) => (
          <View style={formStyles.field}>
            <Text style={formStyles.label}>{t('viewProfile.field.phone')}</Text>
            <TextInput
              style={[formStyles.input, fieldState.error && formStyles.inputError]}
              placeholder={t('auth.createProfile.phone.placeholder')}
              placeholderTextColor={Palette.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="phone-pad"
              value={field.value ?? ''}
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
          <View style={formStyles.loadingRow}>
            <ActivityIndicator color={Palette.textOnPrimary} size="small" />
            <Text style={formStyles.primaryButtonText}>
              {loadingLabel ?? t('auth.createProfile.loading')}
            </Text>
          </View>
        ) : (
          <Text style={formStyles.primaryButtonText}>
            {submitLabel ?? t('auth.createProfile.button')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = {
  localeFieldCompact: {
    marginTop: -Spacing.xxl,
  },
};
