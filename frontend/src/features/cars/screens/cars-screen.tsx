import { useRouter } from 'expo-router';
import { Car, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { type UserCar } from '@/features/cars/api';
import { useCars, useDeleteCar } from '@/features/cars/queries';
import { mapErrorToMessageKey } from '@/shared/api';
import { getErrorStatus } from '@/shared/api/errors';
import { popOrReplace } from '@/shared/navigation/back';
import { PlateSchema } from '@/shared/schemas/common';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';
import { ActionMenu } from '@/shared/ui/components/action-menu';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

function formatValue(value: unknown, fallback = '-') {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function formatPlateForDisplay(value: unknown, fallback = '-') {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  const result = PlateSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  return value.toUpperCase();
}

function getCarId(car: UserCar) {
  return typeof car.id === 'string' && car.id ? car.id : null;
}

export default function ManageCarsScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const session = useRequireAuth();
  const userId = session.data?.user?.id ?? null;

  const carsQuery = useCars(userId);
  const deleteCarMutation = useDeleteCar(userId);

  const [deletingCarId, setDeletingCarId] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState('');

  const cars = carsQuery.data ?? [];
  const isLoading = carsQuery.isLoading || session.isPending;

  // Surface any query-level error via the same bottom `formMessage` slot the
  // old `loadCars` catch-block used, so the visible UX matches the previous
  // behavior without a dedicated error banner.
  useEffect(() => {
    if (carsQuery.error) {
      setFormMessage(t(mapErrorToMessageKey(carsQuery.error)));
    }
  }, [carsQuery.error, t]);

  async function handleDeleteCar(carId: string) {
    setFormMessage('');

    if (!userId) {
      return;
    }

    setDeletingCarId(carId);
    try {
      await deleteCarMutation.mutateAsync(carId);
      setFormMessage(t('manageCars.delete.success'));
    } catch (error) {
      // Backend returns 409 when the car still has trips associated to it,
      // which the generic mapper would otherwise bucket as "unexpected error".
      if (getErrorStatus(error) === 409) {
        setFormMessage(t('manageCars.delete.error.hasTrips'));
      } else {
        setFormMessage(t(mapErrorToMessageKey(error)));
      }
    } finally {
      setDeletingCarId(null);
    }
  }

  function handleEditCar(car: UserCar) {
    const carId = getCarId(car);
    if (!carId) {
      setFormMessage(t('manageCars.error.default'));
      return;
    }

    router.push({
      pathname: '/edit-car',
      params: { carId },
    });
  }

  function handleBack() {
    popOrReplace(router, '/(tabs)/profile');
  }

  function confirmDeleteCar(car: UserCar) {
    const carId = getCarId(car);
    if (!carId) {
      setFormMessage(t('manageCars.error.default'));
      return;
    }

    Alert.alert(t('manageCars.delete.confirm.title'), t('manageCars.delete.confirm.message'), [
      {
        text: t('manageCars.delete.confirm.cancel'),
        style: 'cancel',
      },
      {
        text: t('manageCars.delete.confirm.accept'),
        style: 'destructive',
        onPress: () => {
          void handleDeleteCar(carId);
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{
          onPress: handleBack,
          accessibilityLabel: t('viewProfile.back'),
        }}
        rightAction={
          <Pressable
            accessibilityLabel={t('manageCars.form.title')}
            accessibilityRole="button"
            onPress={() => {
              setFormMessage('');
              router.push('/add-car');
            }}
            style={({ pressed }) => [styles.addCircleButton, pressed && styles.addCirclePressed]}
          >
            <Plus color={Palette.textOnPrimary} size={24} />
          </Pressable>
        }
        subtitle={t('manageCars.subtitle')}
        title={t('manageCars.title')}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={() => {
              void carsQuery.refetch();
            }}
            refreshing={carsQuery.isRefetching}
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <View style={styles.content}>
          {isLoading ? (
            <View style={[styles.statusCard, styles.loadingRow]}>
              <ActivityIndicator color={Palette.primary} size="small" />
              <Text style={styles.loadingText}>{t('manageCars.list.loading')}</Text>
            </View>
          ) : cars.length === 0 ? (
            <View style={styles.statusCard}>
              <Text style={styles.emptyText}>{t('manageCars.list.empty')}</Text>
            </View>
          ) : (
            <View style={styles.listContainer}>
              {cars.map((car) => {
                const carId = getCarId(car);
                const isThisDeleting = deletingCarId === carId;
                const actionsDisabled = deletingCarId !== null || !carId;
                const colorLabel = formatValue(car.color, t('manageCars.list.noColor'));
                const seats = formatValue(car.passengerSeats);
                const plate = formatPlateForDisplay(car.plate);
                return (
                  <View key={carId ?? formatValue(car.plate, 'car')} style={styles.carItem}>
                    <View style={styles.carIconCircle}>
                      <Car color={Palette.primary} size={22} />
                    </View>
                    <View style={styles.carInfo}>
                      <Text numberOfLines={1} style={styles.carTitle}>
                        {formatValue(car.model?.brand)} {formatValue(car.model?.name)}
                      </Text>
                      <Text numberOfLines={1} style={styles.carMeta}>
                        {colorLabel} • {seats} • {plate}
                      </Text>
                    </View>
                    <View style={styles.carActions}>
                      {isThisDeleting ? (
                        <ActivityIndicator color={Palette.danger} size="small" />
                      ) : (
                        <ActionMenu
                          accessibilityLabel={t('manageCars.list.menu.label')}
                          actions={[
                            {
                              label: t('manageCars.list.menu.edit.label'),
                              description: t('manageCars.list.menu.edit.description'),
                              icon: <Pencil color={Palette.textSecondary} size={16} />,
                              disabled: actionsDisabled,
                              onPress: () => handleEditCar(car),
                            },
                            {
                              label: t('manageCars.list.menu.delete.label'),
                              description: t('manageCars.list.menu.delete.description'),
                              icon: <Trash2 color={Palette.danger} size={16} />,
                              danger: true,
                              disabled: actionsDisabled,
                              onPress: () => confirmDeleteCar(car),
                            },
                          ]}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {formMessage ? <Text style={styles.formMessage}>{formMessage}</Text> : null}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 36,
  },
  content: {
    width: '100%',
    maxWidth: 820,
    gap: Spacing.md + 2,
  },
  statusCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  carIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCirclePressed: {
    opacity: 0.85,
  },
  loadingRow: {
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  listContainer: {
    gap: Spacing.md - 2,
  },
  carItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 12,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Palette.card,
  },
  carInfo: {
    flex: 1,
    minWidth: 0,
  },
  carActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carTitle: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: 2,
  },
  carMeta: {
    color: Palette.textSecondary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  formMessage: {
    color: Palette.textSecondary,
    fontSize: FontSize.base,
    textAlign: 'center',
    lineHeight: 18,
  },
});
