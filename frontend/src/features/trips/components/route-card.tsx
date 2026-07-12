import { ArrowUpDown } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { type MapLocation } from '@/features/trips/create-trip/types';
import { LocationField } from '@/features/trips/location-picker/location-field';
import { Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type RowProps = {
  rowLabel: string;
  placeholder: string;
  value: string;
  initialCenter: MapLocation | null;
  drawerTitle: string;
  mapTitle: string;
  onSelectPlace: (place: { address: string; latitude: number; longitude: number }) => void;
  /** Optional clear handler forwarded to the underlying `LocationField`. */
  onClear?: () => void;
};

type Props = {
  apiKey: string;
  origin: RowProps;
  destination: RowProps;
  onSwap?: () => void;
  swapAccessibilityLabel?: string;
  hasError?: boolean;
};

const SWAP_BUTTON_WIDTH = 32;
const SWAP_BUTTON_RIGHT = Spacing.md;
const SWAP_RESERVED = SWAP_BUTTON_WIDTH + SWAP_BUTTON_RIGHT;

/**
 * Two stacked location triggers (origin + destination) inside a single
 * bordered card with a divider between them. Each row is a self-contained
 * `LocationField` that owns its own picker drawer and map modal — taps on
 * a row open *that row's* picker. The optional swap button overlays the
 * right side, vertically centered between the two rows.
 */
export function RouteCard({
  apiKey,
  origin,
  destination,
  onSwap,
  swapAccessibilityLabel,
  hasError = false,
}: Props) {
  const reserved = onSwap ? SWAP_RESERVED : 0;
  return (
    <View style={[styles.card, hasError && styles.cardError]}>
      <LocationField
        apiKey={apiKey}
        dot="origin"
        drawerTitle={origin.drawerTitle}
        initialCenter={origin.initialCenter}
        mapTitle={origin.mapTitle}
        onClear={origin.onClear}
        onSelectPlace={origin.onSelectPlace}
        placeholder={origin.placeholder}
        reservedRight={reserved}
        rowLabel={origin.rowLabel}
        value={origin.value}
      />

      <View style={[styles.divider, { marginRight: reserved }]} />

      <LocationField
        apiKey={apiKey}
        dot="destination"
        drawerTitle={destination.drawerTitle}
        initialCenter={destination.initialCenter}
        mapTitle={destination.mapTitle}
        onClear={destination.onClear}
        onSelectPlace={destination.onSelectPlace}
        placeholder={destination.placeholder}
        reservedRight={reserved}
        rowLabel={destination.rowLabel}
        value={destination.value}
      />

      {onSwap ? (
        <Pressable
          accessibilityLabel={swapAccessibilityLabel}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onSwap}
          style={({ pressed }) => [styles.swapBtn, pressed && styles.swapBtnPressed]}
        >
          <ArrowUpDown color={Palette.primaryDark} size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    ...Shadow.cardSoft,
  },
  cardError: {
    borderColor: Palette.danger,
  },
  divider: {
    height: 1,
    backgroundColor: Palette.border,
    marginLeft: 12 + Spacing.md,
  },
  swapBtn: {
    position: 'absolute',
    right: SWAP_BUTTON_RIGHT,
    top: '50%',
    marginTop: -16,
    width: SWAP_BUTTON_WIDTH,
    height: SWAP_BUTTON_WIDTH,
    borderRadius: SWAP_BUTTON_WIDTH / 2,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapBtnPressed: {
    opacity: 0.85,
  },
});
