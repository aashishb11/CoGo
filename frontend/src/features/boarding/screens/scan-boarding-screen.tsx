import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRequireAuth } from '@/features/auth/queries';
import { useScanBoarding } from '@/features/boarding/queries';
import { formatCents } from '@/features/wallet/format';
import { mapErrorToMessageKey } from '@/shared/api';
import { toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

type ScanState =
  | { phase: 'scanning' }
  | { phase: 'processing' }
  | { phase: 'success'; fareCents: number }
  | { phase: 'error'; message: string };

export default function ScanBoardingScreen() {
  useRequireAuth();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const lang = toLang(i18n.resolvedLanguage ?? i18n.language) ?? 'en';

  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const scanMutation = useScanBoarding();
  const [state, setState] = useState<ScanState>({ phase: 'scanning' });

  // `CameraView.onBarcodeScanned` fires several times per second while a QR
  // is in frame, and React batching means stale closures of `state.phase`
  // can race past the early return. Once we've started processing a token we
  // hold this ref until the user explicitly taps "Scan another" — otherwise
  // a single QR would chain into multiple network calls and the success
  // screen would auto-advance to the next scan / error.
  const processingLockRef = useRef(false);

  const handleBarcodeScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (processingLockRef.current) return;
      if (state.phase !== 'scanning') return;
      const token = typeof data === 'string' ? data.trim() : '';
      if (!token) return;

      processingLockRef.current = true;
      setState({ phase: 'processing' });
      try {
        const result = await scanMutation.mutateAsync(token);
        setState({ phase: 'success', fareCents: result.fareCents });
      } catch (error) {
        setState({
          phase: 'error',
          message: t(mapErrorToMessageKey(error)),
        });
      }
    },
    [scanMutation, state.phase, t],
  );

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/agenda');
    }
  }

  function handleScanAgain() {
    // Reset the re-entry lock so the next QR resumes scanning. We intentionally
    // require an explicit user tap here (rather than auto-resuming from the
    // success/error state) so the driver can confirm the previous outcome
    // before pointing the camera at the next passenger.
    processingLockRef.current = false;
    setState({ phase: 'scanning' });
  }

  if (!permission) {
    return (
      <View style={styles.screen}>
        <ScreenHeader
          back={{ onPress: handleBack }}
          subtitle={t('rideLifecycle.scan.subtitle')}
          title={t('rideLifecycle.scan.title')}
        />
        <View style={styles.permissionWrap}>
          <ActivityIndicator color={Palette.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.screen}>
        <ScreenHeader
          back={{ onPress: handleBack }}
          subtitle={t('rideLifecycle.scan.subtitle')}
          title={t('rideLifecycle.scan.title')}
        />
        <View style={styles.permissionWrap}>
          <Text style={styles.permissionTitle}>{t('rideLifecycle.scan.permissionTitle')}</Text>
          <Text style={styles.permissionMessage}>
            {permission.canAskAgain
              ? t('rideLifecycle.scan.permissionMessage')
              : t('rideLifecycle.scan.permissionDenied')}
          </Text>
          {permission.canAskAgain ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void requestPermission();
              }}
              style={({ pressed }) => [
                formStyles.primaryButton,
                pressed && formStyles.primaryButtonPressed,
              ]}
            >
              <Text style={formStyles.primaryButtonText}>
                {t('rideLifecycle.scan.permissionGrant')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{ onPress: handleBack }}
        subtitle={t('rideLifecycle.scan.subtitle')}
        title={t('rideLifecycle.scan.title')}
      />

      <View style={styles.cameraWrap}>
        <CameraView
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          facing="back"
          onBarcodeScanned={state.phase === 'scanning' ? handleBarcodeScanned : undefined}
          style={styles.camera}
        />
        <View pointerEvents="none" style={styles.reticleOverlay}>
          <View style={styles.reticle} />
        </View>
      </View>

      <View
        style={[
          styles.footer,
          // Bottom inset keeps "Scan another" / "Done" clear of the home
          // indicator on iOS and the gesture bar on Android. Spacing.lg keeps
          // a baseline gap on hardware with no inset.
          { paddingBottom: Math.max(insets.bottom, Spacing.lg) },
        ]}
      >
        {state.phase === 'scanning' ? (
          <Text style={styles.hint}>{t('rideLifecycle.scan.pointAtCode')}</Text>
        ) : null}

        {state.phase === 'processing' ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={Palette.primary} size="small" />
            <Text style={styles.hint}>{t('rideLifecycle.scan.processing')}</Text>
          </View>
        ) : null}

        {state.phase === 'success' ? (
          <View style={styles.successCard}>
            <CheckCircle2 color={Palette.primary} size={28} />
            <Text style={styles.successText}>
              {state.fareCents > 0
                ? t('rideLifecycle.scan.success', {
                    fare: formatCents(state.fareCents, lang),
                  })
                : t('rideLifecycle.scan.successFallback')}
            </Text>
            <View style={styles.actionsRow}>
              <Pressable
                accessibilityRole="button"
                onPress={handleScanAgain}
                style={({ pressed }) => [
                  formStyles.secondaryButton,
                  styles.actionButton,
                  pressed && styles.actionPressed,
                ]}
              >
                <Text style={formStyles.secondaryButtonText}>{t('rideLifecycle.scan.again')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleBack}
                style={({ pressed }) => [
                  formStyles.primaryButton,
                  styles.actionButton,
                  pressed && formStyles.primaryButtonPressed,
                ]}
              >
                <Text style={formStyles.primaryButtonText}>{t('rideLifecycle.scan.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {state.phase === 'error' ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{state.message}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={handleScanAgain}
              style={({ pressed }) => [
                formStyles.primaryButton,
                pressed && formStyles.primaryButtonPressed,
              ]}
            >
              <Text style={formStyles.primaryButtonText}>{t('rideLifecycle.scan.again')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  permissionWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  permissionTitle: {
    ...Typography.title,
    color: Palette.text,
    textAlign: 'center',
  },
  permissionMessage: {
    ...Typography.body,
    color: Palette.textSecondary,
    textAlign: 'center',
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  reticleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: 240,
    height: 240,
    borderRadius: Radii.lg,
    borderWidth: 3,
    borderColor: Palette.primary,
  },
  footer: {
    backgroundColor: Palette.background,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  hint: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  successCard: {
    backgroundColor: Palette.primarySurface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.primary,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.cardSoft,
  },
  successText: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  actionButton: {
    flex: 1,
  },
  actionPressed: {
    opacity: 0.85,
  },
  errorCard: {
    backgroundColor: Palette.dangerSurface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.danger,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
});
