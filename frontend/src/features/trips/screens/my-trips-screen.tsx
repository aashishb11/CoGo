import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
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

import { useSession } from '@/features/auth/queries';
import { MyTripCard } from '@/features/trips/components/my-trip-card';
import { useCancelDriverTrip, useDriverTrips } from '@/features/trips/queries';
import { mapErrorToMessageKey } from '@/shared/api';
import { popOrReplace } from '@/shared/navigation/back';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { Toast, type ToastKind } from '@/shared/ui/components/toast';

type ToastState = { kind: ToastKind; message: string } | null;

export default function MyTripsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const fromProfile = (Array.isArray(from) ? from[0] : from) === 'profile';

  const session = useSession();
  const userId = session.data?.user?.id ?? null;

  const tripsQuery = useDriverTrips(userId);
  const cancelTrip = useCancelDriverTrip(userId);

  const [toast, setToast] = useState<ToastState>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!cancelTrip.isSuccess) return;
    setToast({ kind: 'success', message: t('myTrips.feedback.cancelled') });
  }, [cancelTrip.isSuccess, t]);

  useEffect(() => {
    if (!cancelTrip.error) return;
    setToast({ kind: 'error', message: t(mapErrorToMessageKey(cancelTrip.error)) });
  }, [cancelTrip.error, t]);

  const handleOpenDetails = useCallback(
    (tripId: string) => {
      router.push({
        pathname: '/trips/[id]',
        params: { id: tripId },
      });
    },
    [router],
  );

  const handleEdit = useCallback(
    (tripId: string) => {
      router.push({
        pathname: '/trips/edit/[id]' as never,
        params: { id: tripId },
      });
    },
    [router],
  );

  const handleCancel = useCallback(
    (tripId: string) => {
      Alert.alert(
        t('myTrips.cancelConfirm.title'),
        t('myTrips.cancelConfirm.message'),
        [
          { text: t('myTrips.cancelConfirm.cancel'), style: 'cancel' },
          {
            text: t('myTrips.cancelConfirm.accept'),
            style: 'destructive',
            onPress: () => {
              void cancelTrip.mutateAsync(tripId).catch(() => {
                // Surfaced via the cancelTrip.error toast.
              });
            },
          },
        ],
        { cancelable: true },
      );
    },
    [cancelTrip, t],
  );

  const handleBack = useCallback(() => {
    popOrReplace(router, fromProfile ? '/(tabs)/profile' : '/(tabs)/trips/create');
  }, [fromProfile, router]);

  const handleCreateTrip = useCallback(() => {
    router.push('/(tabs)/trips/create');
  }, [router]);

  const trips = tripsQuery.data ?? [];
  const isLoading = Boolean(userId) && tripsQuery.isLoading;
  const errorMessage = tripsQuery.error ? t('myTrips.error') : '';
  const pendingDeleteTripId = cancelTrip.isPending ? (cancelTrip.variables ?? null) : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{
          onPress: handleBack,
          accessibilityLabel: fromProfile ? t('myTrips.backToProfile') : t('myTrips.backToCreate'),
        }}
        rightAction={
          fromProfile ? (
            <Pressable
              accessibilityLabel={t('myTrips.createTrip')}
              accessibilityRole="button"
              onPress={handleCreateTrip}
              style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}
            >
              <Plus color={Palette.textOnPrimary} size={24} />
            </Pressable>
          ) : null
        }
        subtitle={t('myTrips.screenSubtitle')}
        title={t('myTrips.screenTitle')}
      />

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={() => {
              void tripsQuery.refetch();
            }}
            refreshing={tripsQuery.isRefetching}
            tintColor={Palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        {isLoading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={Palette.primary} size="small" />
            <Text style={styles.statusText}>{t('myTrips.loading')}</Text>
          </View>
        ) : null}

        {!isLoading && errorMessage ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {!isLoading && !errorMessage && trips.length === 0 ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{t('myTrips.empty')}</Text>
          </View>
        ) : null}

        {!isLoading && !errorMessage && trips.length > 0 ? (
          <View style={styles.list}>
            {trips.map((trip) => (
              <MyTripCard
                isCancelling={pendingDeleteTripId === trip.id}
                key={trip.id}
                onCancel={handleCancel}
                onEdit={handleEdit}
                onPress={handleOpenDetails}
                trip={trip}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Toast
        kind={toast?.kind ?? 'success'}
        message={toast?.message ?? ''}
        onDismiss={dismissToast}
        visible={toast !== null}
      />
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
  container: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl + Spacing.md,
    gap: Spacing.md,
  },
  // Circle add button — same pattern as the My Cars screen so the global
  // "create new" affordance reads consistently across the app.
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonPressed: {
    opacity: 0.85,
  },
  list: {
    gap: Spacing.md,
  },
  statusCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  errorCard: {
    backgroundColor: Palette.dangerSurface,
    borderColor: Palette.danger,
  },
  statusText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
});
