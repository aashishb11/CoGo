import * as Location from 'expo-location';
import { LocateFixed, MapPin, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';

type LocationPickerModalProps = {
  apiKey: string;
  cancelLabel: string;
  confirmLabel: string;
  hintLabel: string;
  loadingLabel: string;
  onClose: () => void;
  onConfirm: (location: { latitude: number; longitude: number; address: string }) => void;
  title: string;
  visible: boolean;
  initialCenter?: {
    latitude: number;
    longitude: number;
  } | null;
};

const DEFAULT_REGION: Region = {
  latitude: 41.3874,
  longitude: 2.1686,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

const PIN_SIZE = 36;

async function reverseGeocode({
  apiKey,
  lang,
  latitude,
  longitude,
}: {
  apiKey: string;
  lang: Lang;
  latitude: number;
  longitude: number;
}): Promise<string> {
  const fallback = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  if (!apiKey) {
    return fallback;
  }

  const params = new URLSearchParams({
    latlng: `${latitude},${longitude}`,
    key: apiKey,
    language: lang,
  });

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
    );

    if (!response.ok) {
      return fallback;
    }

    const data = await response.json();

    if (data?.status !== 'OK' || !Array.isArray(data?.results) || data.results.length === 0) {
      return fallback;
    }

    return data.results[0]?.formatted_address ?? fallback;
  } catch {
    return fallback;
  }
}

async function getCurrentUserRegion(): Promise<Region | null> {
  const currentPermission = await Location.getForegroundPermissionsAsync();
  const permission =
    currentPermission.status === Location.PermissionStatus.UNDETERMINED
      ? await Location.requestForegroundPermissionsAsync()
      : currentPermission;

  if (permission.status !== Location.PermissionStatus.GRANTED) {
    return null;
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    ...DEFAULT_REGION,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

export function LocationPickerModal({
  apiKey,
  cancelLabel,
  confirmLabel,
  hintLabel,
  loadingLabel,
  onClose,
  onConfirm,
  title,
  visible,
  initialCenter,
}: LocationPickerModalProps) {
  const { i18n, t } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;
  const startingRegion = useMemo<Region>(() => {
    if (!initialCenter) {
      return DEFAULT_REGION;
    }

    return {
      ...DEFAULT_REGION,
      latitude: initialCenter.latitude,
      longitude: initialCenter.longitude,
    };
  }, [initialCenter]);

  const [region, setRegion] = useState<Region>(startingRegion);
  const [resolvedAddress, setResolvedAddress] = useState('');
  const [isPreparingInitialRegion, setIsPreparingInitialRegion] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const mapRef = useRef<MapView | null>(null);

  const centerOnUserLocation = useCallback(async () => {
    setIsLocatingUser(true);
    try {
      const userRegion = await getCurrentUserRegion();
      if (!userRegion) {
        return;
      }

      setRegion(userRegion);
      mapRef.current?.animateToRegion(userRegion, 350);
    } catch {
      // Keep the current map position if permission, GPS, or platform services fail.
    } finally {
      setIsLocatingUser(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let cancelled = false;
    setRegion(startingRegion);

    if (initialCenter) {
      setIsPreparingInitialRegion(false);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      setIsPreparingInitialRegion(true);
      setIsLocatingUser(true);
      const userRegion = await getCurrentUserRegion().catch(() => null);
      if (!cancelled && userRegion) {
        setRegion(userRegion);
      }
      if (!cancelled) {
        setIsLocatingUser(false);
        setIsPreparingInitialRegion(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialCenter, visible, startingRegion]);

  useEffect(() => {
    if (!visible || isPreparingInitialRegion) {
      return;
    }

    let cancelled = false;
    setIsResolvingAddress(true);

    const timeoutId = setTimeout(() => {
      void (async () => {
        const address = await reverseGeocode({
          apiKey,
          lang,
          latitude: region.latitude,
          longitude: region.longitude,
        });

        if (!cancelled) {
          setResolvedAddress(address);
          setIsResolvingAddress(false);
        }
      })();
    }, 380);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [apiKey, isPreparingInitialRegion, lang, region.latitude, region.longitude, visible]);

  const canConfirm = !isPreparingInitialRegion && !isResolvingAddress && resolvedAddress.length > 0;
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={false} visible={visible}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <Pressable
            accessibilityLabel={cancelLabel}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
          >
            <X color={Palette.text} size={22} />
          </Pressable>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {/* Spacer keeps the title centered without a second top action. */}
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.mapWrap}>
          {isPreparingInitialRegion ? (
            <View style={styles.mapLoading}>
              <ActivityIndicator color={Palette.primary} size="large" />
            </View>
          ) : (
            <MapView
              initialRegion={region}
              onRegionChangeComplete={setRegion}
              ref={mapRef}
              showsMyLocationButton={false}
              showsUserLocation
              style={StyleSheet.absoluteFill}
            />
          )}

          <View pointerEvents="none" style={styles.centerPinWrap}>
            <MapPin
              color={Palette.primaryDark}
              fill={Palette.primary}
              size={PIN_SIZE}
              strokeWidth={2}
            />
          </View>

          {!initialCenter && !isPreparingInitialRegion ? (
            <Pressable
              accessibilityLabel={t('createTrip.mapPicker.myLocation')}
              accessibilityRole="button"
              accessibilityState={{ disabled: isLocatingUser }}
              disabled={isLocatingUser}
              hitSlop={10}
              onPress={() => void centerOnUserLocation()}
              style={({ pressed }) => [
                styles.myLocationButton,
                pressed && !isLocatingUser && styles.myLocationButtonPressed,
                isLocatingUser && styles.myLocationButtonDisabled,
              ]}
            >
              {isLocatingUser ? (
                <ActivityIndicator color={Palette.primary} size="small" />
              ) : (
                <LocateFixed color={Palette.primaryDark} size={22} strokeWidth={2.4} />
              )}
            </Pressable>
          ) : null}
        </View>

        <View
          style={[
            styles.bottomPanel,
            { paddingBottom: Math.max(Spacing.lg, insets.bottom + Spacing.sm) },
          ]}
        >
          <Text style={styles.hintText}>{hintLabel}</Text>
          <View style={styles.addressRow}>
            {isResolvingAddress ? (
              <ActivityIndicator color={Palette.primary} size="small" />
            ) : (
              <MapPin color={Palette.textSecondary} size={16} />
            )}
            <Text numberOfLines={3} style={styles.addressText}>
              {isResolvingAddress ? loadingLabel : resolvedAddress}
            </Text>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                formStyles.secondaryButton,
                styles.actionButton,
                pressed && styles.secondaryButtonPressed,
              ]}
            >
              <Text style={formStyles.secondaryButtonText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
              disabled={!canConfirm}
              onPress={() =>
                onConfirm({
                  latitude: region.latitude,
                  longitude: region.longitude,
                  address: resolvedAddress,
                })
              }
              style={({ pressed }) => [
                formStyles.primaryButton,
                styles.actionButton,
                !canConfirm && formStyles.primaryButtonDisabled,
                pressed && canConfirm && formStyles.primaryButtonPressed,
              ]}
            >
              <Text style={formStyles.primaryButtonText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  header: {
    minHeight: 64,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    backgroundColor: Palette.background,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.backgroundMuted,
  },
  closeButtonPressed: {
    opacity: 0.85,
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: Palette.text,
    fontSize: FontSize.xl,
    lineHeight: 22,
    fontWeight: FontWeight.bold,
  },
  mapWrap: {
    flex: 1,
  },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.backgroundMuted,
  },
  centerPinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    // The pin's tip sits at the bottom-center of its viewbox, so anchor the
    // tip at the map center by offsetting up by the full icon height.
    marginLeft: -PIN_SIZE / 2,
    marginTop: -PIN_SIZE,
    ...Shadow.heroCta,
  },
  myLocationButton: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
    ...Shadow.cardSoft,
  },
  myLocationButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  myLocationButtonDisabled: {
    opacity: 0.72,
  },
  bottomPanel: {
    borderTopWidth: 1,
    borderTopColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: Palette.card,
  },
  hintText: {
    ...Typography.bodyEmphasized,
    color: Palette.text,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Palette.backgroundMuted,
    borderRadius: Radii.md,
  },
  addressText: {
    flex: 1,
    ...Typography.bodySmall,
    color: Palette.text,
    fontWeight: FontWeight.semibold,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  actionButton: {
    flex: 1,
    width: undefined,
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
});
