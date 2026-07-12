import { zodResolver } from '@hookform/resolvers/zod';
import { Car } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { type CarModel } from '@/features/car-models/api';
import { MIN_SEARCH_CHARS, useCarModelsSearch } from '@/features/car-models/queries';
import {
  CreateCarSchema,
  type CreateCarFormValues,
  type CreateCarInput,
} from '@/features/cars/schemas';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { translateZodMessage } from '@/shared/utils/zod-error-map';

type Props = {
  onSubmit: (data: CreateCarInput) => Promise<void> | void;
  onCancel?: () => void;
  formError?: string | null;
  defaultValues?: Partial<CreateCarFormValues>;
  defaultModel?: CarModel | null;
  submitLabel?: string;
  loadingLabel?: string;
};

function formatPlateInput(value: string) {
  const compactValue = value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  let digits = '';
  let letters = '';

  for (const char of compactValue) {
    if (digits.length < 4) {
      if (/\d/.test(char)) {
        digits += char;
      }
      continue;
    }

    if (/[A-Z]/.test(char)) {
      letters += char;
    }
    if (letters.length === 3) {
      break;
    }
  }

  return letters.length > 0 ? `${digits}-${letters}` : digits;
}

export function CarForm({
  onSubmit,
  onCancel,
  formError,
  defaultValues,
  defaultModel,
  submitLabel,
  loadingLabel,
}: Props) {
  const { t } = useTranslation();
  const [selectedModel, setSelectedModel] = useState<CarModel | null>(defaultModel ?? null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setSelectedModel(defaultModel ?? null);
  }, [defaultModel]);

  const form = useForm<z.input<typeof CreateCarSchema>, unknown, CreateCarInput>({
    resolver: zodResolver(CreateCarSchema),
    defaultValues: {
      modelId: defaultValues?.modelId ?? '',
      plate: defaultValues?.plate ?? '',
      passengerSeats: defaultValues?.passengerSeats ?? '',
      color: defaultValues?.color ?? '',
    },
    mode: 'onSubmit',
  });

  const modelsQuery = useCarModelsSearch(searchQuery);

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data);
  });

  const isSubmitting = form.formState.isSubmitting;

  function pickModel(model: CarModel) {
    setSelectedModel(model);
    setSearchQuery('');
    form.setValue('modelId', model.id, { shouldValidate: true });
  }

  function clearModel() {
    setSelectedModel(null);
    form.setValue('modelId', '', { shouldValidate: false });
  }

  return (
    <View style={{ width: '100%', gap: Spacing.lg }}>
      {/* Model picker — replaces the old free-text brand/model TextInputs.
          Backend now requires `modelId` referencing the car_models catalog. */}
      <Controller
        control={form.control}
        name="modelId"
        render={({ fieldState }) => (
          <View style={formStyles.field}>
            <Text style={formStyles.label}>{t('manageCars.form.modelPicker.label')}</Text>
            {selectedModel ? (
              <View style={pickerStyles.selectedRow}>
                <View style={{ flex: 1 }}>
                  <Text style={pickerStyles.selectedTitle}>
                    {selectedModel.brand} {selectedModel.name}
                  </Text>
                  <Text style={pickerStyles.selectedMeta}>
                    {selectedModel.type} • {selectedModel.year}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={t('manageCars.form.modelPicker.change')}
                  disabled={isSubmitting}
                  onPress={clearModel}
                  style={pickerStyles.changeButton}
                >
                  <Text style={pickerStyles.changeButtonText}>
                    {t('manageCars.form.modelPicker.change')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  style={[formStyles.input, fieldState.error && formStyles.inputError]}
                  placeholder={t('manageCars.form.modelPicker.placeholder')}
                  placeholderTextColor={Palette.textSecondary}
                  autoCapitalize="words"
                  autoCorrect={false}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  editable={!isSubmitting}
                />
                {searchQuery.trim().length < MIN_SEARCH_CHARS ? (
                  <Text style={pickerStyles.hint}>{t('manageCars.form.modelPicker.minChars')}</Text>
                ) : modelsQuery.isLoading ? (
                  <View style={pickerStyles.statusRow}>
                    <ActivityIndicator color={Palette.textSecondary} size="small" />
                    <Text style={pickerStyles.hint}>
                      {t('manageCars.form.modelPicker.searching')}
                    </Text>
                  </View>
                ) : modelsQuery.data && modelsQuery.data.items.length > 0 ? (
                  <>
                    {/* maxHeight + nested ScrollView keeps the picker bounded
                        even on long result lists; without it the modal blows
                        out and the submit button gets pushed off-screen. */}
                    <ScrollView
                      style={pickerStyles.resultsScroll}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      <View style={pickerStyles.resultsList}>
                        {modelsQuery.data.items.map((m) => (
                          <Pressable
                            key={m.id}
                            onPress={() => pickModel(m)}
                            style={({ pressed }) => [
                              pickerStyles.resultItem,
                              pressed && pickerStyles.resultItemPressed,
                            ]}
                          >
                            <Car color={Palette.primary} size={16} />
                            <View style={{ flex: 1 }}>
                              <Text style={pickerStyles.resultTitle}>
                                {m.brand} {m.name}
                              </Text>
                              <Text style={pickerStyles.resultMeta}>
                                {m.type} • {m.year}
                              </Text>
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                    {modelsQuery.data.total > modelsQuery.data.items.length ? (
                      <Text style={pickerStyles.hint}>
                        {t('manageCars.form.modelPicker.refine', {
                          total: String(modelsQuery.data.total),
                        })}
                      </Text>
                    ) : null}
                  </>
                ) : modelsQuery.data ? (
                  <Text style={pickerStyles.hint}>{t('manageCars.form.modelPicker.empty')}</Text>
                ) : null}
              </>
            )}
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
        name="plate"
        render={({ field, fieldState }) => (
          <View style={formStyles.field}>
            <Text style={formStyles.label}>{t('manageCars.list.plate')}</Text>
            <TextInput
              style={[formStyles.input, fieldState.error && formStyles.inputError]}
              placeholder={t('manageCars.form.plate.placeholder')}
              placeholderTextColor={Palette.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              value={field.value}
              onChangeText={(v) => field.onChange(formatPlateInput(v))}
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
        name="passengerSeats"
        render={({ field, fieldState }) => (
          <View style={formStyles.field}>
            <Text style={formStyles.label}>{t('manageCars.list.seats')}</Text>
            <TextInput
              style={[formStyles.input, fieldState.error && formStyles.inputError]}
              placeholder={t('manageCars.form.seats.placeholder')}
              placeholderTextColor={Palette.textSecondary}
              keyboardType="number-pad"
              value={String(field.value ?? '')}
              onChangeText={(v) => field.onChange(v.replace(/[^0-9]/g, ''))}
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
        name="color"
        render={({ field }) => (
          <View style={formStyles.field}>
            <Text style={formStyles.label}>{t('manageCars.list.color')}</Text>
            <TextInput
              style={formStyles.input}
              placeholder={t('manageCars.form.color.placeholder')}
              placeholderTextColor={Palette.textSecondary}
              autoCapitalize="words"
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              editable={!isSubmitting}
            />
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
              {loadingLabel ?? t('manageCars.form.loading')}
            </Text>
          </View>
        ) : (
          <Text style={formStyles.primaryButtonText}>
            {submitLabel ?? t('manageCars.form.submit')}
          </Text>
        )}
      </Pressable>

      {onCancel ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          disabled={isSubmitting}
          style={({ pressed }) => [
            formStyles.secondaryButton,
            pressed && !isSubmitting && formStyles.primaryButtonPressed,
            isSubmitting && formStyles.primaryButtonDisabled,
          ]}
        >
          <Text style={formStyles.secondaryButtonText}>
            {t('manageCars.delete.confirm.cancel')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const pickerStyles = {
  selectedRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Palette.primary,
    borderRadius: Radii.md,
    backgroundColor: Palette.card,
  },
  selectedTitle: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  selectedMeta: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  changeButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radii.sm,
    backgroundColor: Palette.backgroundMuted,
  },
  changeButtonText: {
    color: Palette.primary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  hint: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    marginTop: Spacing.xs,
  },
  statusRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  resultsScroll: {
    marginTop: Spacing.xs,
    maxHeight: 280,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radii.md,
  },
  resultsList: {
    overflow: 'hidden' as const,
  },
  resultItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  resultItemPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  resultTitle: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  resultMeta: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 1,
  },
};
