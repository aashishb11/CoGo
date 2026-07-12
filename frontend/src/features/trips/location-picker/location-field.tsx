import { ChevronRight, Map as MapIcon, MapPin, Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationPickerModal } from './location-picker-modal';

import { usePlaceAutocomplete } from '@/features/trips/create-trip/place-autocomplete-input';
import { type MapLocation } from '@/features/trips/create-trip/types';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type DotColor = 'origin' | 'destination' | null;

type Props = {
  apiKey: string;
  /** Small label above the value (e.g., "Starting from"). */
  rowLabel: string;
  placeholder: string;
  value: string;
  initialCenter: MapLocation | null;
  drawerTitle: string;
  mapTitle: string;
  onSelectPlace: (place: { address: string; latitude: number; longitude: number }) => void;
  /**
   * Optional clear handler. When provided AND `value` is non-empty:
   *  - the trigger row shows an X button instead of the ChevronRight
   *  - the drawer shows a "Clear" pill in the search row
   * Both invoke this callback to reset the parent's selected place.
   */
  onClear?: () => void;
  hasError?: boolean;
  /** Visual bullet on the trigger row. `origin` = dark, `destination` = green. */
  dot?: DotColor;
  /** Reserve right-side padding for an absolutely-positioned sibling (e.g. swap btn). */
  reservedRight?: number;
  style?: StyleProp<ViewStyle>;
};

// Half-sheet sizing: ~55% of the screen, capped at 520pt for tall devices.
// The user explicitly didn't want the iOS pageSheet's near-full-height
// behavior, so we present a custom translucent Modal whose content is a
// fixed-height card slid up from the bottom.
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = Math.min(Math.round(SCREEN_HEIGHT * 0.55), 520);

// How far the user has to drag the handle before a release dismisses the
// sheet. Below this we spring back to fully-open.
const DISMISS_DRAG_THRESHOLD = 90;
// Or: a quick downward flick at any drag distance dismisses too.
const DISMISS_VELOCITY_THRESHOLD = 0.6;

const SHEET_OFFSCREEN_Y = SHEET_HEIGHT + 120;

export function LocationField({
  apiKey,
  rowLabel,
  placeholder,
  value,
  initialCenter,
  drawerTitle,
  mapTitle,
  onSelectPlace,
  onClear,
  hasError = false,
  dot = null,
  reservedRight = 0,
  style,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [drawerMounted, setDrawerMounted] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [draft, setDraft] = useState(value);
  const translateY = useRef(new Animated.Value(SHEET_OFFSCREEN_Y)).current;
  const inputRef = useRef<TextInput>(null);

  const animateOpen = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const animateClose = useCallback(
    (onDone?: () => void) => {
      Animated.timing(translateY, {
        toValue: SHEET_OFFSCREEN_Y,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDone?.();
      });
    },
    [translateY],
  );

  const handleSelect = useCallback(
    (place: { address: string; latitude: number; longitude: number }) => {
      onSelectPlace(place);
      animateClose(() => setDrawerMounted(false));
    },
    [animateClose, onSelectPlace],
  );

  const { predictions, open, loading, showEmpty, pick } = usePlaceAutocomplete({
    apiKey,
    value: draft,
    onChangeText: setDraft,
    onSelectPlace: handleSelect,
  });

  // Re-seed the input when the drawer opens. Intentionally only depends
  // on mount, not on `value` — otherwise typing-then-receiving-a-new-prop
  // would clobber the user's in-progress text. Also auto-focus the search
  // input so the keyboard opens without an extra tap. The small delay lets
  // the Modal finish mounting on iOS — focusing during the animation can be
  // flaky. We use an imperative `inputRef.current?.focus()` rather than the
  // `autoFocus` prop to avoid triggering the `jsx-a11y/no-autofocus` lint
  // rule (the project keeps a fixed warning budget).
  useEffect(() => {
    if (!drawerMounted) return;
    setDraft(value);
    const handle = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerMounted]);

  const openDrawer = useCallback(() => {
    setDrawerMounted(true);
    requestAnimationFrame(animateOpen);
  }, [animateOpen]);

  const closeDrawer = useCallback(() => {
    animateClose(() => setDrawerMounted(false));
  }, [animateClose]);

  const openMap = useCallback(() => {
    if (drawerMounted) {
      animateClose(() => {
        setDrawerMounted(false);
        // One frame for the drawer's Modal to fully unmount, then present
        // the map's Modal. iOS doesn't like two Modals transitioning at once.
        requestAnimationFrame(() => setMapVisible(true));
      });
    } else {
      setMapVisible(true);
    }
  }, [animateClose, drawerMounted]);

  const handleMapConfirm = useCallback(
    (location: MapLocation) => {
      onSelectPlace({
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
      });
      setMapVisible(false);
    },
    [onSelectPlace],
  );

  // PanResponder for swipe-to-dismiss on the sheet header. We track raw drag
  // (downward only) on `translateY`. On release, dismiss if the drag is past
  // the distance threshold OR the user flicked down quickly; otherwise spring
  // back to the open position.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > DISMISS_DRAG_THRESHOLD || gesture.vy > DISMISS_VELOCITY_THRESHOLD) {
            Animated.timing(translateY, {
              toValue: SHEET_OFFSCREEN_Y,
              duration: 200,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) setDrawerMounted(false);
            });
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 80,
              friction: 12,
            }).start();
          }
        },
      }),
    [translateY],
  );

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, SHEET_OFFSCREEN_Y],
    outputRange: [0.45, 0],
    extrapolate: 'clamp',
  });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={openDrawer}
        style={({ pressed }) => [
          styles.trigger,
          { paddingRight: reservedRight + Spacing.sm },
          pressed && styles.triggerPressed,
          style,
        ]}
      >
        {dot ? (
          <View style={[styles.dot, dot === 'origin' ? styles.dotOrigin : styles.dotDestination]} />
        ) : null}
        <View style={styles.body}>
          <Text style={[styles.label, hasError && styles.labelError]}>{rowLabel}</Text>
          <Text numberOfLines={1} style={[styles.value, !value && styles.valuePlaceholder]}>
            {value || placeholder}
          </Text>
        </View>
        {value && onClear ? (
          // Nested Pressable: taps on the X must not bubble up and open the
          // drawer. `accessibilityRole="button"` keeps screen readers from
          // announcing it as part of the parent trigger.
          <Pressable
            accessibilityLabel={t('createTrip.autocomplete.clearField')}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClear}
            style={({ pressed }) => [styles.triggerClearBtn, pressed && styles.triggerPressed]}
          >
            <X color={Palette.textSecondary} size={16} />
          </Pressable>
        ) : (
          <ChevronRight color={Palette.textSecondary} size={16} />
        )}
      </Pressable>

      <Modal animationType="none" onRequestClose={closeDrawer} transparent visible={drawerMounted}>
        <View style={drawerStyles.fill}>
          <Animated.View
            pointerEvents={drawerMounted ? 'auto' : 'none'}
            style={[drawerStyles.backdrop, { opacity: backdropOpacity }]}
          >
            <Pressable
              accessibilityLabel={t('createTrip.time.cancel')}
              onPress={closeDrawer}
              style={drawerStyles.backdropTouch}
            />
          </Animated.View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
            style={drawerStyles.sheetWrap}
          >
            <Animated.View
              style={[
                drawerStyles.sheet,
                {
                  height: SHEET_HEIGHT,
                  paddingBottom: insets.bottom + Spacing.lg,
                  transform: [{ translateY }],
                },
              ]}
            >
              <View {...panResponder.panHandlers} style={drawerStyles.grabArea}>
                <View style={drawerStyles.handle} />
                <View style={drawerStyles.header}>
                  <Text numberOfLines={1} style={drawerStyles.title}>
                    {drawerTitle}
                  </Text>
                  <Pressable
                    accessibilityLabel={t('createTrip.time.cancel')}
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={closeDrawer}
                    style={({ pressed }) => [drawerStyles.iconBtn, pressed && drawerStyles.pressed]}
                  >
                    <X color={Palette.text} size={22} />
                  </Pressable>
                </View>
              </View>

              <View style={drawerStyles.body}>
                <View style={drawerStyles.searchRow}>
                  <View style={drawerStyles.searchBox}>
                    <Search color={Palette.textSecondary} size={18} />
                    <TextInput
                      autoCorrect={false}
                      onChangeText={setDraft}
                      placeholder={placeholder}
                      placeholderTextColor={Palette.textSecondary}
                      ref={inputRef}
                      returnKeyType="search"
                      style={drawerStyles.searchInput}
                      value={draft}
                    />
                    {loading ? (
                      <ActivityIndicator color={Palette.primary} size="small" />
                    ) : draft ? (
                      <Pressable
                        accessibilityLabel={t('createTrip.autocomplete.clear')}
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={() => setDraft('')}
                        style={({ pressed }) => [
                          drawerStyles.clearBtn,
                          pressed && drawerStyles.pressed,
                        ]}
                      >
                        <X color={Palette.textSecondary} size={16} />
                      </Pressable>
                    ) : null}
                  </View>
                  {value && onClear ? (
                    // Clears the parent's selected place (distinct from the
                    // inner X above, which only resets the search draft).
                    <Pressable
                      accessibilityLabel={t('createTrip.autocomplete.clearSelection')}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => {
                        onClear();
                        setDraft('');
                        closeDrawer();
                      }}
                      style={({ pressed }) => [
                        drawerStyles.clearPill,
                        pressed && drawerStyles.pressed,
                      ]}
                    >
                      <X color={Palette.textSecondary} size={16} />
                      <Text style={drawerStyles.clearPillText}>
                        {t('createTrip.autocomplete.clearSelection')}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityLabel={t('createTrip.mapPicker.button')}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={openMap}
                    style={({ pressed }) => [drawerStyles.mapBtn, pressed && drawerStyles.pressed]}
                  >
                    <MapIcon color={Palette.primaryDark} size={20} />
                  </Pressable>
                </View>

                {open && predictions.length > 0 ? (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    style={drawerStyles.resultsList}
                  >
                    {predictions.map((prediction, index, array) => {
                      const isLast = index === array.length - 1;
                      return (
                        <Pressable
                          accessibilityRole="button"
                          key={prediction.placeId}
                          onPress={() => void pick(prediction)}
                          style={({ pressed }) => [
                            drawerStyles.resultRow,
                            !isLast && drawerStyles.resultDivider,
                            pressed && drawerStyles.resultRowPressed,
                          ]}
                        >
                          <MapPin color={Palette.textSecondary} size={18} />
                          <Text numberOfLines={2} style={drawerStyles.resultText}>
                            {prediction.description}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : showEmpty ? (
                  <Text style={drawerStyles.emptyText}>
                    {t('createTrip.autocomplete.noResults')}
                  </Text>
                ) : null}
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <LocationPickerModal
        apiKey={apiKey}
        cancelLabel={t('createTrip.mapPicker.cancel')}
        confirmLabel={t('createTrip.mapPicker.confirm')}
        hintLabel={t('createTrip.mapPicker.hint')}
        initialCenter={initialCenter}
        loadingLabel={t('createTrip.mapPicker.loading')}
        onClose={() => setMapVisible(false)}
        onConfirm={handleMapConfirm}
        title={mapTitle}
        visible={mapVisible}
      />
    </>
  );
}

const SEARCH_FIELD_HEIGHT = 48;

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 60,
  },
  triggerPressed: {
    opacity: 0.7,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotOrigin: {
    backgroundColor: Palette.text,
  },
  dotDestination: {
    backgroundColor: Palette.primary,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  labelError: {
    color: Palette.danger,
  },
  value: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
  valuePlaceholder: {
    color: Palette.textSecondary,
    fontWeight: FontWeight.medium,
  },
  triggerClearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.backgroundMuted,
  },
});

const drawerStyles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
  },
  backdropTouch: {
    flex: 1,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Palette.background,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    overflow: 'hidden',
    ...Shadow.card,
  },
  // The grab area (handle + header) hosts the PanResponder. Keeping it
  // separate from the body means dragging on results doesn't fight with
  // the inner ScrollView.
  grabArea: {
    paddingTop: Spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Palette.border,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    color: Palette.text,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchBox: {
    flex: 1,
    height: SEARCH_FIELD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    backgroundColor: Palette.card,
  },
  searchInput: {
    flex: 1,
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.medium,
    paddingVertical: 0,
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.backgroundMuted,
  },
  mapBtn: {
    width: SEARCH_FIELD_HEIGHT,
    height: SEARCH_FIELD_HEIGHT,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.primary,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: SEARCH_FIELD_HEIGHT,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.backgroundMuted,
  },
  clearPillText: {
    color: Palette.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  // Results list spans the full sheet width (no card chrome) so it reads
  // like a native search results list rather than a constrained dropdown
  // anchored to the input.
  resultsList: {
    flex: 1,
    marginTop: Spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  resultDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  resultRowPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  resultText: {
    flex: 1,
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    lineHeight: 20,
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    paddingVertical: Spacing.lg,
    textAlign: 'center',
  },
});
