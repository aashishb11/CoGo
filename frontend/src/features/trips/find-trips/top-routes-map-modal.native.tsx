import { useQueries } from '@tanstack/react-query';
import { User, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type LatLng, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { decodePolyline } from './decode-polyline';
import { type TopRoutesMapModalProps } from './top-routes-map-modal.types';

import { getTripById } from '@/features/trips/api';
import { queryKeys } from '@/features/trips/queries';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';

const FALLBACK_REGION: Region = {
  latitude: 41.3874,
  longitude: 2.1686,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const hPrime = h / 60;
  const x = chroma * (1 - Math.abs((hPrime % 2) - 1));

  let r = 0;
  let g = 0;
  let b = 0;
  if (hPrime < 1) [r, g] = [chroma, x];
  else if (hPrime < 2) [r, g] = [x, chroma];
  else if (hPrime < 3) [g, b] = [chroma, x];
  else if (hPrime < 4) [g, b] = [x, chroma];
  else if (hPrime < 5) [r, b] = [x, chroma];
  else [r, b] = [chroma, x];

  const m = l - chroma / 2;
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round((v + m) * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function colorForIndex(index: number, total: number): string {
  const denominator = Math.max(1, total);
  return hslToHex((index * (360 / denominator)) % 360, 76, 48);
}

export function TopRoutesMapModal({
  visible,
  onClose,
  onSelectRoute,
  routes,
  searchOrigin,
  searchDestination,
  title,
  closeLabel,
  emptyLabel,
  hintLabel,
  searchOriginLabel,
  searchDestinationLabel,
  animationType = 'slide',
}: TopRoutesMapModalProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);

  // Fetch trip details for each visible route in parallel so we can render the
  // real driving route (`routePolyline`) instead of a straight line. Only
  // enabled while the modal is open to avoid background traffic.
  const tripDetailQueries = useQueries({
    queries: routes.map((route) => ({
      queryKey: queryKeys.trip(route.tripId),
      queryFn: () => getTripById(route.tripId),
      enabled: visible && Boolean(route.tripId),
      staleTime: 60_000,
    })),
  });

  const decoratedRoutes = useMemo(
    () =>
      routes.map((route, index) => {
        const detail = tripDetailQueries[index]?.data;
        const decoded = detail?.routePolyline ? decodePolyline(detail.routePolyline) : [];
        const originCoordinate: LatLng = {
          latitude: route.origin.lat,
          longitude: route.origin.lng,
        };
        const destinationCoordinate: LatLng = {
          latitude: route.destination.lat,
          longitude: route.destination.lng,
        };
        const polylineCoordinates: LatLng[] =
          decoded.length >= 2 ? decoded : [originCoordinate, destinationCoordinate];
        return {
          ...route,
          color: colorForIndex(index, routes.length),
          originCoordinate,
          destinationCoordinate,
          polylineCoordinates,
        };
      }),
    [routes, tripDetailQueries],
  );

  const searchOriginCoordinate = useMemo<LatLng | null>(
    () => (searchOrigin ? { latitude: searchOrigin.lat, longitude: searchOrigin.lng } : null),
    [searchOrigin],
  );
  const searchDestinationCoordinate = useMemo<LatLng | null>(
    () =>
      searchDestination
        ? { latitude: searchDestination.lat, longitude: searchDestination.lng }
        : null,
    [searchDestination],
  );

  const allCoordinates = useMemo<LatLng[]>(() => {
    const points = decoratedRoutes.flatMap((route) => route.polylineCoordinates);
    if (searchOriginCoordinate) points.push(searchOriginCoordinate);
    if (searchDestinationCoordinate) points.push(searchDestinationCoordinate);
    return points;
  }, [decoratedRoutes, searchOriginCoordinate, searchDestinationCoordinate]);

  const initialRegion = useMemo<Region>(() => {
    if (allCoordinates.length === 0) return FALLBACK_REGION;
    const lats = allCoordinates.map((c) => c.latitude);
    const lngs = allCoordinates.map((c) => c.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.05, (maxLat - minLat) * 1.6),
      longitudeDelta: Math.max(0.05, (maxLng - minLng) * 1.6),
    };
  }, [allCoordinates]);

  useEffect(() => {
    if (!visible || allCoordinates.length < 2) return;
    const frame = requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(allCoordinates, {
        animated: true,
        edgePadding: { top: 80, right: 60, bottom: 80, left: 60 },
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [allCoordinates, visible]);

  function handleMarkerPress(tripId: string) {
    onClose();
    requestAnimationFrame(() => onSelectRoute(tripId));
  }

  return (
    <Modal
      animationType={animationType}
      onRequestClose={onClose}
      transparent={false}
      visible={visible}
    >
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <Pressable
            accessibilityLabel={closeLabel}
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
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.mapWrap}>
          {decoratedRoutes.length > 0 ? (
            <MapView initialRegion={initialRegion} ref={mapRef} style={StyleSheet.absoluteFill}>
              {decoratedRoutes.map((route) => (
                <Polyline
                  key={`polyline-${route.tripId}`}
                  coordinates={route.polylineCoordinates}
                  strokeColor={route.color}
                  strokeWidth={4}
                />
              ))}
              {decoratedRoutes.map((route) => (
                <Marker
                  anchor={{ x: 0.5, y: 0.5 }}
                  coordinate={route.originCoordinate}
                  description={route.destination.label}
                  key={`origin-${route.tripId}`}
                  onPress={() => handleMarkerPress(route.tripId)}
                  title={route.origin.label}
                  tracksViewChanges={false}
                >
                  <View style={[styles.routeMarker, { backgroundColor: route.color }]}>
                    <Text style={styles.routeMarkerText}>O</Text>
                  </View>
                </Marker>
              ))}
              {decoratedRoutes.map((route) => (
                <Marker
                  anchor={{ x: 0.5, y: 0.5 }}
                  coordinate={route.destinationCoordinate}
                  description={route.origin.label}
                  key={`destination-${route.tripId}`}
                  onPress={() => handleMarkerPress(route.tripId)}
                  title={route.destination.label}
                  tracksViewChanges={false}
                >
                  <View
                    style={[
                      styles.routeMarker,
                      styles.routeMarkerDestination,
                      { backgroundColor: route.color },
                    ]}
                  >
                    <Text style={styles.routeMarkerText}>D</Text>
                  </View>
                </Marker>
              ))}
              {searchOriginCoordinate ? (
                <Marker
                  anchor={{ x: 0.5, y: 0.5 }}
                  coordinate={searchOriginCoordinate}
                  description={searchOrigin?.label}
                  key="search-origin"
                  title={searchOriginLabel}
                  tracksViewChanges={false}
                >
                  <View style={[styles.searchMarker, styles.searchMarkerOrigin]}>
                    <User color={Palette.background} size={18} strokeWidth={2.5} />
                  </View>
                </Marker>
              ) : null}
              {searchDestinationCoordinate ? (
                <Marker
                  anchor={{ x: 0.5, y: 0.5 }}
                  coordinate={searchDestinationCoordinate}
                  description={searchDestination?.label}
                  key="search-destination"
                  title={searchDestinationLabel}
                  tracksViewChanges={false}
                >
                  <View style={[styles.searchMarker, styles.searchMarkerDestination]}>
                    <Text style={styles.searchMarkerText}>F</Text>
                  </View>
                </Marker>
              ) : null}
            </MapView>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{emptyLabel}</Text>
            </View>
          )}
        </View>

        <View
          style={[
            styles.bottomPanel,
            { paddingBottom: Math.max(Spacing.lg, insets.bottom + Spacing.sm) },
          ]}
        >
          <Text style={styles.hintText}>{hintLabel}</Text>
          {decoratedRoutes.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.legendContent}
              showsVerticalScrollIndicator={false}
              style={styles.legendScroll}
            >
              {decoratedRoutes.map((route) => (
                <Pressable
                  accessibilityRole="button"
                  key={`legend-${route.tripId}`}
                  onPress={() => handleMarkerPress(route.tripId)}
                  style={({ pressed }) => [styles.legendRow, pressed && styles.legendRowPressed]}
                >
                  <View style={[styles.legendSwatch, { backgroundColor: route.color }]} />
                  <Text numberOfLines={2} style={styles.legendText}>
                    {route.origin.label}
                    {' → '}
                    {route.destination.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
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
  routeMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Palette.background,
    ...Shadow.cardSoft,
  },
  routeMarkerDestination: {
    borderRadius: 6,
  },
  routeMarkerText: {
    color: Palette.background,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    lineHeight: 18,
  },
  searchMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Palette.background,
    ...Shadow.cardSoft,
  },
  searchMarkerOrigin: {
    backgroundColor: Palette.primaryDark,
  },
  searchMarkerDestination: {
    backgroundColor: Palette.text,
  },
  searchMarkerText: {
    color: Palette.background,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    lineHeight: 18,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  emptyText: {
    ...Typography.bodySmall,
    color: Palette.textSecondary,
    textAlign: 'center',
  },
  bottomPanel: {
    borderTopWidth: 1,
    borderTopColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: Palette.card,
    ...Shadow.cardSoft,
  },
  hintText: {
    ...Typography.bodyEmphasized,
    color: Palette.text,
  },
  legendScroll: {
    maxHeight: 152,
  },
  legendContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.md,
  },
  legendRowPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  legendSwatch: {
    width: 16,
    height: 16,
    borderRadius: Radii.sm,
  },
  legendText: {
    flex: 1,
    color: Palette.text,
    fontSize: FontSize.base,
    lineHeight: 20,
    fontWeight: FontWeight.medium,
  },
});
