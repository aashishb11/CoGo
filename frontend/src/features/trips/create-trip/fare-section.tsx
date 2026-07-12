import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { createTripStyles as styles } from './styles';
import type { CreateTripFormValues } from './use-create-trip';

import { FontWeight, Palette, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';

type Props = {
  control: Control<CreateTripFormValues>;
};

function normalizeEuroInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 5);
}

export function FareSection({ control }: Props) {
  const { t } = useTranslation();

  return (
    <View style={localStyles.section}>
      <Text style={styles.label}>{t('createTrip.pricePerSeat.label')}</Text>
      <Controller
        control={control}
        name="pricePerSeatEuros"
        render={({ field, fieldState }) => (
          <View>
            <View style={[styles.inputShell, fieldState.error && styles.inputShellError]}>
              <TextInput
                editable
                keyboardType="number-pad"
                onBlur={field.onBlur}
                onChangeText={(value) => field.onChange(normalizeEuroInput(value))}
                placeholder={t('createTrip.pricePerSeat.placeholder')}
                placeholderTextColor={Palette.textSecondary}
                style={styles.input}
                value={field.value ?? ''}
              />
              <Text style={localStyles.currency}>EUR</Text>
            </View>
            {fieldState.error ? (
              <Text style={formStyles.errorText}>{t('createTrip.pricePerSeat.required')}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  section: {
    gap: Spacing.md,
  },
  currency: {
    color: Palette.textSecondary,
    fontWeight: FontWeight.bold,
  },
});
