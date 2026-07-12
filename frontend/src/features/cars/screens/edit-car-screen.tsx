import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { type UserCar } from '@/features/cars/api';
import { CarForm } from '@/features/cars/forms/car-form';
import { useCars, useUpdateCar } from '@/features/cars/queries';
import type { CreateCarInput } from '@/features/cars/schemas';
import { mapErrorToMessageKey } from '@/shared/api';
import { popOrReplace } from '@/shared/navigation/back';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

function getCarId(car: UserCar) {
  return typeof car.id === 'string' && car.id ? car.id : null;
}

function toFormText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function toPassengerSeatsValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function normalizeCarIdParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return (value[0] ?? '').trim();
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

export default function EditCarScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { carId: rawCarId } = useLocalSearchParams<{ carId?: string | string[] }>();
  const carId = normalizeCarIdParam(rawCarId);
  const [formError, setFormError] = useState<string | null>(null);

  const session = useRequireAuth();
  const userId = session.data?.user?.id ?? null;
  const carsQuery = useCars(userId);
  const updateCarMutation = useUpdateCar(userId);

  const isLoading = session.isPending || carsQuery.isLoading;
  const queryError = carsQuery.error;
  const car = useMemo(() => {
    if (!carId) {
      return null;
    }
    const allCars = carsQuery.data;
    if (!Array.isArray(allCars)) {
      return null;
    }
    return allCars.find((item) => getCarId(item) === carId) ?? null;
  }, [carId, carsQuery.data]);
  const isMissingCar = !isLoading && !queryError && (!carId || (carsQuery.isSuccess && !car));

  function handleBack() {
    popOrReplace(router, '/cars');
  }

  async function handleSubmit(data: CreateCarInput) {
    setFormError(null);
    if (!userId || !carId) {
      return;
    }

    try {
      await updateCarMutation.mutateAsync({ carId, input: data });
      router.replace('/cars');
    } catch (error) {
      setFormError(t(mapErrorToMessageKey(error)));
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{
          onPress: handleBack,
          accessibilityLabel: t('viewProfile.back'),
        }}
        subtitle={t('manageCars.edit.description')}
        title={t('manageCars.edit.title')}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.card}>
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={Palette.primary} size="small" />
                <Text style={styles.loadingText}>{t('manageCars.edit.loading')}</Text>
              </View>
            </View>
          ) : null}

          {!isLoading && queryError ? (
            <Text style={styles.errorText}>{t(mapErrorToMessageKey(queryError))}</Text>
          ) : null}

          {!isLoading && !queryError && isMissingCar ? (
            <View style={[styles.card, styles.infoContainer]}>
              <Text style={styles.infoText}>{t('manageCars.edit.notFound')}</Text>
              <Pressable onPress={() => router.replace('/cars')} style={styles.cta}>
                <Text style={styles.ctaText}>{t('tab.manageCars.title')}</Text>
              </Pressable>
            </View>
          ) : null}

          {!isLoading && !queryError && car ? (
            <View style={styles.card}>
              <CarForm
                defaultModel={car.model ?? null}
                defaultValues={{
                  modelId: car.modelId,
                  plate: toFormText(car.plate),
                  passengerSeats: toPassengerSeatsValue(car.passengerSeats),
                  color: toFormText(car.color),
                }}
                formError={formError}
                loadingLabel={t('manageCars.edit.save.loading')}
                onSubmit={handleSubmit}
                submitLabel={t('manageCars.edit.save.button')}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  content: {
    width: '100%',
    maxWidth: 820,
    gap: Spacing.md,
    paddingTop: Spacing.lg,
  },
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg + 2,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: Spacing.lg,
    ...Shadow.cardSoft,
  },
  loadingContainer: {
    width: '100%',
    minHeight: 100,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  infoContainer: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  infoText: {
    color: Palette.textSecondary,
    textAlign: 'center',
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  cta: {
    backgroundColor: Palette.primary,
    minHeight: 44,
    borderRadius: Radii.sm + 2,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.base,
    textAlign: 'center',
  },
});
