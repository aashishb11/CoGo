import { useCallback, useState } from 'react';

import { type SearchRidesInput } from '@/features/trips/api';
import { type MapLocation } from '@/features/trips/create-trip/types';

export type FindTripsTripType = 'all' | 'recurring';

export type FindTripsFormState = {
  origin: string;
  destination: string;
  /** ISO YYYY-MM-DD in Europe/Madrid. Defaults to today. */
  date: string;
  /** Earliest departure HH:mm (24h). `null` means no time filter. */
  earliestDeparture: string | null;
  /** Whether to show all rides or just recurring ones. */
  tripType: FindTripsTripType;
};

// Backend requires `radiusKm` and accepts `seatsNeeded`. We hide both from the
// UI and pin them server-side: the search is "any ride on this route on the
// selected date".
const DEFAULT_RADIUS_KM = 5;
const DEFAULT_SEATS_NEEDED = 1;

export type FindTripsPickerTarget = 'origin' | 'destination' | null;

function todayIsoMadrid(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function useFindTripsForm() {
  const [form, setForm] = useState<FindTripsFormState>(() => ({
    origin: '',
    destination: '',
    date: todayIsoMadrid(),
    earliestDeparture: null,
    tripType: 'all',
  }));
  const [originLocation, setOriginLocation] = useState<MapLocation | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<MapLocation | null>(null);
  const [pickerTarget, setPickerTarget] = useState<FindTripsPickerTarget>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateField = useCallback(
    <K extends keyof FindTripsFormState>(key: K, value: FindTripsFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const openPicker = useCallback((target: Exclude<FindTripsPickerTarget, null>) => {
    setPickerTarget(target);
  }, []);

  const closePicker = useCallback(() => {
    setPickerTarget(null);
  }, []);

  const applyPlaceSelection = useCallback(
    (target: 'origin' | 'destination', location: MapLocation) => {
      if (target === 'origin') {
        setForm((prev) => ({ ...prev, origin: location.address }));
        setOriginLocation(location);
      } else {
        setForm((prev) => ({ ...prev, destination: location.address }));
        setDestinationLocation(location);
      }
    },
    [],
  );

  const clearPlaceSelection = useCallback((target: 'origin' | 'destination') => {
    if (target === 'origin') {
      setForm((prev) => ({ ...prev, origin: '' }));
      setOriginLocation(null);
    } else {
      setForm((prev) => ({ ...prev, destination: '' }));
      setDestinationLocation(null);
    }
  }, []);

  const handleConfirmMapLocation = useCallback(
    (location: MapLocation) => {
      if (pickerTarget === 'origin' || pickerTarget === 'destination') {
        applyPlaceSelection(pickerTarget, location);
      }
      setPickerTarget(null);
    },
    [applyPlaceSelection, pickerTarget],
  );

  // Validates the form. On success returns the search payload ready for the
  // results screen; on failure stores a `validationError` flag and returns null
  // so the caller can short-circuit navigation.
  const buildSearchPayload = useCallback((): SearchRidesInput | null => {
    if (!originLocation || !form.origin.trim()) {
      setValidationError('origin');
      return null;
    }
    if (!destinationLocation || !form.destination.trim()) {
      setValidationError('destination');
      return null;
    }
    setValidationError(null);
    return {
      origin: {
        label: form.origin.trim(),
        lat: originLocation.latitude,
        lng: originLocation.longitude,
      },
      destination: {
        label: form.destination.trim(),
        lat: destinationLocation.latitude,
        lng: destinationLocation.longitude,
      },
      date: /^\d{4}-\d{2}-\d{2}$/.test(form.date) ? form.date : todayIsoMadrid(),
      radiusKm: DEFAULT_RADIUS_KM,
      seatsNeeded: DEFAULT_SEATS_NEEDED,
    };
  }, [destinationLocation, form.date, form.destination, form.origin, originLocation]);

  return {
    form,
    updateField,
    originLocation,
    destinationLocation,
    pickerTarget,
    openPicker,
    closePicker,
    applyPlaceSelection,
    clearPlaceSelection,
    handleConfirmMapLocation,
    buildSearchPayload,
    validationError,
  };
}
