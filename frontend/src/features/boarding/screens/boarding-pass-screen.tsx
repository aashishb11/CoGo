import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useRequireAuth } from '@/features/auth/queries';
import { useBoardingToken } from '@/features/boarding/queries';
import { getErrorCode, mapErrorToMessageKey } from '@/shared/api';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function BoardingPassScreen() {
  useRequireAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  const params = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = (params.bookingId ?? '').trim();

  const tokenQuery = useBoardingToken(bookingId);
  const [refreshTick, setRefreshTick] = useState(false);

  // Small visual heartbeat so users get a hint when the token rotates. The
  // actual rotation is driven by react-query's refetchInterval inside
  // useBoardingToken, so this is decorative — we just flip a flag for ~600ms
  // around every successful refetch.
  useEffect(() => {
    if (!tokenQuery.isFetching) return;
    setRefreshTick(true);
    const timer = setTimeout(() => setRefreshTick(false), 600);
    return () => clearTimeout(timer);
  }, [tokenQuery.isFetching]);

  const qrSize = useMemo(() => {
    const target = Math.min(width - Spacing.xxl * 2, 360);
    return Math.max(240, target);
  }, [width]);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/agenda');
    }
  }

  const token = tokenQuery.data?.token ?? '';
  const validUntil = tokenQuery.data?.validUntil ?? '';
  const errorCode = tokenQuery.error ? getErrorCode(tokenQuery.error) : undefined;
  const errorMessage = tokenQuery.error
    ? errorCode === 'RIDE_NOT_IN_PROGRESS'
      ? t('rideLifecycle.boardingPass.error.notInProgress')
      : t(mapErrorToMessageKey(tokenQuery.error))
    : '';

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack, accessibilityLabel: t('rideLifecycle.boardingPass.back') }}
        subtitle={t('rideLifecycle.boardingPass.subtitle')}
        title={t('rideLifecycle.boardingPass.title')}
      />

      <View style={styles.content}>
        {tokenQuery.isLoading && !token ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={Palette.primary} size="small" />
          </View>
        ) : null}

        {errorMessage ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {token ? (
          <View style={styles.qrCard}>
            <View style={styles.qrFrame}>
              <QRCode
                backgroundColor={Palette.card}
                color={Palette.text}
                size={qrSize}
                value={token}
              />
            </View>
            <Text style={styles.tokenLabel}>{t('rideLifecycle.boardingPass.tokenLabel')}</Text>
            {validUntil ? (
              <Text style={styles.refreshLine}>
                {refreshTick
                  ? t('rideLifecycle.boardingPass.refreshing')
                  : t('rideLifecycle.boardingPass.validUntil', { time: formatTime(validUntil) })}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  statusCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.cardSoft,
  },
  errorCard: {
    backgroundColor: Palette.dangerSurface,
  },
  errorText: {
    ...Typography.body,
    color: Palette.danger,
    textAlign: 'center',
  },
  qrCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.cardSoft,
  },
  qrFrame: {
    backgroundColor: Palette.card,
    padding: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  tokenLabel: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  refreshLine: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
