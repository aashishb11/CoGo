import { MapPin } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createTripStyles as styles } from './styles';

import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

export type Prediction = { placeId: string; description: string };
export type SelectedPlace = { address: string; latitude: number; longitude: number };

type Props = {
  apiKey: string;
  value: string;
  placeholder: string;
  hasError?: boolean;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  onSelectPlace: (place: SelectedPlace) => void;
  // ISO-3166 alpha-2. Default 'es' since CoGo currently targets Spain. Pass an
  // empty string to lift the restriction.
  countryCode?: string;
};

// Places API (New) — Google deprecated the legacy `place/autocomplete/json`
// REST endpoint in 2025. The new endpoint is POST + field masks.
const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places';

type AutocompleteSuggestion = {
  placePrediction?: {
    placeId?: unknown;
    text?: { text?: unknown };
  };
};

async function fetchPredictions(
  apiKey: string,
  input: string,
  lang: Lang,
  country: string,
): Promise<Prediction[]> {
  if (!apiKey) {
    if (__DEV__) console.warn('[autocomplete] missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
    return [];
  }

  const body: Record<string, unknown> = {
    input,
    languageCode: lang,
  };
  if (country) {
    body.regionCode = country;
    // Filter to the configured country's results explicitly. The new API uses
    // an array of ISO codes under `includedRegionCodes`.
    body.includedRegionCodes = [country];
  }

  try {
    const response = await fetch(AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (__DEV__) {
        const errBody = await response.text();
        console.warn(
          `[autocomplete] Places API ${response.status} ${response.statusText}: ${errBody}`,
        );
      }
      return [];
    }

    const data = (await response.json()) as { suggestions?: AutocompleteSuggestion[] };
    if (!Array.isArray(data.suggestions)) {
      return [];
    }

    const results: Prediction[] = [];
    for (const item of data.suggestions) {
      const placeId = item.placePrediction?.placeId;
      const description = item.placePrediction?.text?.text;
      if (typeof placeId === 'string' && typeof description === 'string') {
        results.push({ placeId, description });
      }
    }
    return results;
  } catch (error) {
    if (__DEV__) console.warn('[autocomplete] fetch failed', error);
    return [];
  }
}

async function fetchPlaceDetails(
  apiKey: string,
  placeId: string,
  lang: Lang,
): Promise<SelectedPlace | null> {
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(lang)}`,
      {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'id,formattedAddress,location',
        },
      },
    );

    if (!response.ok) {
      if (__DEV__) {
        const errBody = await response.text();
        console.warn(
          `[place-details] Places API ${response.status} ${response.statusText}: ${errBody}`,
        );
      }
      return null;
    }

    const data = (await response.json()) as {
      formattedAddress?: unknown;
      location?: { latitude?: unknown; longitude?: unknown };
    };
    const address = data.formattedAddress;
    const latitude = data.location?.latitude;
    const longitude = data.location?.longitude;
    if (
      typeof address !== 'string' ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number'
    ) {
      return null;
    }
    return { address, latitude, longitude };
  } catch (error) {
    if (__DEV__) console.warn('[place-details] fetch failed', error);
    return null;
  }
}

type UsePlaceAutocompleteParams = {
  apiKey: string;
  value: string;
  onChangeText: (text: string) => void;
  onSelectPlace: (place: SelectedPlace) => void;
  countryCode?: string;
};

export type UsePlaceAutocompleteResult = {
  predictions: Prediction[];
  open: boolean;
  loading: boolean;
  showEmpty: boolean;
  pick: (prediction: Prediction) => Promise<void>;
};

/**
 * Headless autocomplete: debounced fetch of Google Places predictions plus a
 * `pick` action that resolves a chosen suggestion to a coordinate-bearing
 * place. Exported so LocationField can render its own custom layout (input
 * box + full-width results list) while sharing fetch logic with
 * `PlaceAutocompleteInput`.
 */
export function usePlaceAutocomplete({
  apiKey,
  value,
  onChangeText,
  onSelectPlace,
  countryCode = 'es',
}: UsePlaceAutocompleteParams): UsePlaceAutocompleteResult {
  const { i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // After a programmatic select we set the input to the resolved address,
  // which would otherwise re-trigger a fetch and re-open the dropdown right
  // after the user picked a result. This ref skips exactly one debounce cycle.
  const suppressNextFetch = useRef(false);

  useEffect(() => {
    if (suppressNextFetch.current) {
      suppressNextFetch.current = false;
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length < 2 || !apiKey) {
      setPredictions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const id = setTimeout(() => {
      void (async () => {
        const list = await fetchPredictions(apiKey, trimmed, lang, countryCode);
        if (cancelled) return;
        setPredictions(list);
        setOpen(true);
        setLoading(false);
      })();
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [apiKey, value, lang, countryCode]);

  const pick = async (prediction: Prediction) => {
    suppressNextFetch.current = true;
    setOpen(false);
    setLoading(true);
    const place = await fetchPlaceDetails(apiKey, prediction.placeId, lang);
    setLoading(false);
    if (place) {
      onChangeText(place.address);
      onSelectPlace(place);
    } else {
      // Place Details failed; at least keep the picked label in the field so
      // the user isn't left with a stale value.
      onChangeText(prediction.description);
    }
  };

  const showEmpty = open && !loading && predictions.length === 0 && value.trim().length >= 2;

  return { predictions, open, loading, showEmpty, pick };
}

export function PlaceAutocompleteInput({
  apiKey,
  value,
  placeholder,
  hasError,
  onChangeText,
  onBlur,
  onSelectPlace,
  countryCode = 'es',
}: Props) {
  const { t } = useTranslation();
  const { predictions, open, loading, showEmpty, pick } = usePlaceAutocomplete({
    apiKey,
    value,
    onChangeText,
    onSelectPlace,
    countryCode,
  });

  return (
    <View>
      <View style={[styles.inputShell, hasError && styles.inputShellError]}>
        <MapPin color={Palette.textSecondary} size={22} />
        <TextInput
          onBlur={onBlur}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Palette.textSecondary}
          style={styles.input}
          value={value}
        />
        {loading ? <ActivityIndicator color={Palette.primary} size="small" /> : null}
      </View>

      {open && predictions.length > 0 ? (
        <View style={localStyles.dropdown}>
          {predictions.slice(0, 5).map((prediction, index, array) => {
            const isLast = index === array.length - 1;
            return (
              <Pressable
                accessibilityRole="button"
                key={prediction.placeId}
                onPress={() => void pick(prediction)}
                style={({ pressed }) => [
                  localStyles.item,
                  !isLast && localStyles.itemDivider,
                  pressed && localStyles.itemPressed,
                ]}
              >
                <MapPin color={Palette.textSecondary} size={16} />
                <Text numberOfLines={2} style={localStyles.itemText}>
                  {prediction.description}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {showEmpty ? (
        <View style={localStyles.dropdown}>
          <Text style={localStyles.emptyText}>{t('createTrip.autocomplete.noResults')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  dropdown: {
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    backgroundColor: Palette.card,
    overflow: 'hidden',
    ...Shadow.cardSoft,
  },
  item: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  itemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  itemPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  itemText: {
    flex: 1,
    color: Palette.text,
    fontSize: FontSize.md,
    lineHeight: 18,
    fontWeight: FontWeight.medium,
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: FontSize.base,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
});
