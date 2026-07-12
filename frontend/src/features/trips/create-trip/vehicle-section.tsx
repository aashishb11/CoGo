import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createTripStyles as styles } from './styles';
import { type CreateTripFormValues, type VehicleOption } from './use-create-trip';

import { Palette, Spacing } from '@/shared/theme';

type Props = {
  control: Control<CreateTripFormValues>;
  options: VehicleOption[];
};

export function VehicleSection({ control, options }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const goToAddCar = () => {
    router.push('/add-car');
  };

  return (
    <View style={localStyles.section}>
      <Text style={styles.label}>{t('createTrip.vehicle.label')}</Text>
      <Controller
        control={control}
        name="vehicle"
        render={({ field, fieldState }) => (
          <>
            {options.length === 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={goToAddCar}
                style={styles.vehicleAddButton}
              >
                <Plus color={Palette.primaryDark} size={18} />
                <Text style={styles.vehicleAddButtonText}>{t('createTrip.vehicle.addCar')}</Text>
              </Pressable>
            ) : (
              <View style={styles.vehicleRow}>
                {options.map((option) => {
                  const selected = option.value === field.value;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={option.id}
                      onPress={() => field.onChange(option.value)}
                      style={[styles.vehicleOption, selected && styles.vehicleOptionSelected]}
                    >
                      <Text
                        style={[
                          styles.vehicleOptionName,
                          selected && styles.vehicleOptionTextSelected,
                        ]}
                      >
                        {option.name}
                      </Text>
                      <Text
                        style={[
                          styles.vehicleOptionPlate,
                          selected && styles.vehicleOptionTextSelected,
                        ]}
                      >
                        {option.plate}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  onPress={goToAddCar}
                  style={styles.vehicleAddPill}
                >
                  <Plus color={Palette.primaryDark} size={18} />
                  <Text style={styles.vehicleAddPillText}>{t('createTrip.vehicle.addCar')}</Text>
                </Pressable>
              </View>
            )}
            {fieldState.error ? (
              <Text style={styles.errorText}>{t('createTrip.vehicle.required')}</Text>
            ) : null}
          </>
        )}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  section: {
    gap: Spacing.md,
  },
});
