import { useCallback, useEffect, useMemo, useState } from 'react';
import { type FieldErrors, type Resolver, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useSession } from '@/features/auth/queries';
import { type UserCar } from '@/features/cars/api';
import { useCars } from '@/features/cars/queries';
import { type DriverTripDto } from '@/features/trips/api';
import { type MapLocation } from '@/features/trips/create-trip/types';
import {
  type CreateTripFormValues,
  type VehicleOption,
} from '@/features/trips/create-trip/use-create-trip';
import { useTripById, useUpdateDriverTrip } from '@/features/trips/queries';
import { ConversationStyleSchema, DriverMusicGenreSchema } from '@/features/trips/schemas';

export type LocationPickerTarget = 'origin' | 'destination' | null;

const FALLBACK_DEFAULTS: CreateTripFormValues = {
  mode: 'sporadic',
  origin: '',
  destination: '',
  time: '09:00',
  days: [],
  date: '',
  startDate: '',
  endDate: '',
  pricePerSeatEuros: '0',
  vehicle: '',
  preferences: {
    smoker: false,
    conversationStyle: 'casual',
    musicGenres: [],
  },
};

const EditTripEditableFieldsSchema = z.object({
  origin: z.string().trim().min(1, { message: 'required' }),
  destination: z.string().trim().min(1, { message: 'required' }),
  vehicle: z.string().trim().min(1, { message: 'required' }),
  preferences: z.object({
    smoker: z.boolean(),
    conversationStyle: ConversationStyleSchema,
    musicGenres: z.array(DriverMusicGenreSchema),
  }),
});

function setEditFieldError(errors: FieldErrors<CreateTripFormValues>, issue: z.core.$ZodIssue) {
  const [field, child] = issue.path;
  const error = { type: issue.code, message: issue.message };

  if (field === 'origin' || field === 'destination' || field === 'vehicle') {
    errors[field] = error;
    return;
  }

  if (
    field === 'preferences' &&
    (child === 'smoker' || child === 'conversationStyle' || child === 'musicGenres')
  ) {
    errors.preferences = {
      ...(errors.preferences && typeof errors.preferences === 'object' ? errors.preferences : {}),
      [child]: error,
    };
  }
}

// Edit trips through PATCH /api/trips/:tripId, whose backend contract only
// allows route, car, seats, and preference fields. Schedule fields are
// immutable after creation, so the resolver intentionally ignores mode/time/
// days/date/startDate/endDate and carries them through only for read-only UI.
const editTripResolver: Resolver<CreateTripFormValues> = async (values) => {
  const parsed = EditTripEditableFieldsSchema.safeParse(values);

  if (parsed.success) {
    return {
      values: {
        ...values,
        origin: parsed.data.origin,
        destination: parsed.data.destination,
        vehicle: parsed.data.vehicle,
        preferences: parsed.data.preferences,
      },
      errors: {},
    };
  }

  const errors: FieldErrors<CreateTripFormValues> = {};
  for (const issue of parsed.error.issues) {
    setEditFieldError(errors, issue);
  }

  return {
    values: {},
    errors,
  };
};

function mapUserCarToVehicleOption(car: UserCar): VehicleOption | null {
  const id = typeof car.id === 'string' ? car.id.trim() : '';
  if (!id) return null;

  const brand = car.model?.brand?.trim() ?? '';
  const modelName = car.model?.name?.trim() ?? '';
  const plate = typeof car.plate === 'string' ? car.plate.trim() : '';
  const name = [brand, modelName].filter(Boolean).join(' ').trim() || plate || '—';
  const safePlate = plate || '—';

  return { id, name, plate: safePlate, isBackend: true, value: id };
}

function pointLabel(point: DriverTripDto['origin'] | DriverTripDto['destination']): string {
  if (typeof point === 'string') return point.trim();
  if (point && typeof point === 'object' && typeof point.label === 'string') {
    return point.label.trim();
  }
  return '';
}

function pointToMapLocation(
  point: DriverTripDto['origin'] | DriverTripDto['destination'],
): MapLocation | null {
  if (!point || typeof point === 'string') return null;
  const lat = typeof point.lat === 'number' ? point.lat : Number(point.lat);
  const lng = typeof point.lng === 'number' ? point.lng : Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng, address: pointLabel(point) };
}

function daysFromSchedule(trip: DriverTripDto): number[] {
  const schedule = trip.schedule;
  const days: number[] = [];
  if (schedule && typeof schedule === 'object' && schedule.daysOfWeek) {
    const d = schedule.daysOfWeek;
    if (d.monday) days.push(0);
    if (d.tuesday) days.push(1);
    if (d.wednesday) days.push(2);
    if (d.thursday) days.push(3);
    if (d.friday) days.push(4);
    if (d.saturday) days.push(5);
    if (d.sunday) days.push(6);
  }
  return days;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function timeFromTrip(trip: DriverTripDto): string {
  const schedule = trip.schedule;
  if (schedule && typeof schedule.timeOfDay === 'string' && schedule.timeOfDay.trim()) {
    return schedule.timeOfDay.trim();
  }
  if (typeof trip.departureAt === 'string' && trip.departureAt.trim()) {
    const date = new Date(trip.departureAt);
    if (!Number.isNaN(date.getTime())) {
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }
  }
  return '09:00';
}

function dateFromDeparture(trip: DriverTripDto): string {
  if (typeof trip.departureAt !== 'string') return '';
  const date = new Date(trip.departureAt);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Today's date in `YYYY-MM-DD`. Used as a harmless placeholder for read-only
// schedule fields that the backend does not expose and that we never send on
// PATCH. The values are never shown to
// the user — `ScheduleSection` runs with `readOnly` + `hideRecurringDateRange`.
function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function rawPreferences(trip: DriverTripDto): Record<string, unknown> | null {
  return trip.preferences && typeof trip.preferences === 'object'
    ? (trip.preferences as Record<string, unknown>)
    : null;
}

function parseConversationStyle(value: unknown) {
  const parsed = ConversationStyleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseMusicGenre(value: unknown) {
  const parsed = DriverMusicGenreSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function smokerFromTrip(trip: DriverTripDto): boolean {
  const preferences = rawPreferences(trip);

  if (typeof preferences?.smoker === 'boolean') return preferences.smoker;
  if (typeof preferences?.smokeAllowed === 'boolean') return preferences.smokeAllowed;
  if (typeof trip.smokeAllowed === 'boolean') return trip.smokeAllowed;
  if (typeof trip.driver?.smokeAllowed === 'boolean') return trip.driver.smokeAllowed;

  return false;
}

function conversationStyleFromTrip(
  trip: DriverTripDto,
): CreateTripFormValues['preferences']['conversationStyle'] {
  const preferences = rawPreferences(trip);
  return (
    parseConversationStyle(preferences?.conversationStyle) ??
    parseConversationStyle(trip.conversationStyle) ??
    parseConversationStyle(trip.driver?.conversationStyle) ??
    'casual'
  );
}

function musicGenresFromTrip(
  trip: DriverTripDto,
): CreateTripFormValues['preferences']['musicGenres'] {
  const preferences = rawPreferences(trip);

  if (Array.isArray(preferences?.musicGenres)) {
    return preferences.musicGenres
      .map((value) => parseMusicGenre(value))
      .filter(
        (value): value is CreateTripFormValues['preferences']['musicGenres'][number] =>
          value !== null,
      )
      .slice(0, 1);
  }

  const preferenceGenre = parseMusicGenre(preferences?.musicGenre);
  if (preferenceGenre) return [preferenceGenre];

  if (trip.musicAllowed === false || trip.driver?.musicAllowed === false) return [];

  const tripGenre = parseMusicGenre(trip.musicGenre);
  if (tripGenre) return [tripGenre];

  const driverGenre = parseMusicGenre(trip.driver?.musicGenre);
  return driverGenre ? [driverGenre] : [];
}

export function tripDtoToFormValues(trip: DriverTripDto): CreateTripFormValues {
  const isRecurring =
    trip.type === 'recurring' || (trip.type === undefined && Boolean(trip.schedule?.daysOfWeek));

  // Schedule fields are immutable on the backend and `TripDetailResponseDto`
  // does not return `startDate`/`endDate`. We hydrate the hidden date fields
  // with today for display only; edit validation ignores schedule fields.
  // These values are never shipped on PATCH.
  const placeholder = todayIsoDate();

  return {
    mode: isRecurring ? 'recurring' : 'sporadic',
    origin: pointLabel(trip.origin),
    destination: pointLabel(trip.destination),
    time: timeFromTrip(trip),
    days: isRecurring ? daysFromSchedule(trip) : [],
    date: !isRecurring ? dateFromDeparture(trip) || placeholder : placeholder,
    startDate: placeholder,
    endDate: placeholder,
    pricePerSeatEuros:
      typeof trip.pricePerSeatCents === 'number'
        ? String(Math.floor(trip.pricePerSeatCents / 100))
        : '0',
    vehicle: typeof trip.carId === 'string' ? trip.carId : '',
    preferences: {
      smoker: smokerFromTrip(trip),
      conversationStyle: conversationStyleFromTrip(trip),
      musicGenres: musicGenresFromTrip(trip),
    },
  };
}

export type UseEditTripResult = {
  form: ReturnType<typeof useForm<CreateTripFormValues>>;
  tripQuery: ReturnType<typeof useTripById>;
  vehicleOptions: VehicleOption[];
  updateTripPending: boolean;
  updateTripError: unknown;
  updateTripIsSuccess: boolean;
  originLocation: MapLocation | null;
  destinationLocation: MapLocation | null;
  pickerTarget: LocationPickerTarget;
  openPicker: (target: Exclude<LocationPickerTarget, null>) => void;
  closePicker: () => void;
  handleConfirmMapLocation: (location: MapLocation) => void;
  applyPlaceSelection: (target: 'origin' | 'destination', location: MapLocation) => void;
  /**
   * Reset the form value and local map state for the given side. Used by the
   * location picker's clear affordances.
   */
  clearPlaceSelection: (target: 'origin' | 'destination') => void;
  onSubmit: () => Promise<void>;
};

export function useEditTrip(tripId: string | null): UseEditTripResult {
  const session = useSession();
  const userId = session.data?.user?.id ?? null;

  const tripQuery = useTripById(tripId);
  const carsQuery = useCars(userId);
  const updateTrip = useUpdateDriverTrip(userId);

  const trip = tripQuery.data;
  const initialValues = useMemo<CreateTripFormValues>(
    () => (trip ? tripDtoToFormValues(trip) : FALLBACK_DEFAULTS),
    [trip],
  );

  const form = useForm<CreateTripFormValues>({
    resolver: editTripResolver,
    defaultValues: FALLBACK_DEFAULTS,
    values: initialValues,
    mode: 'onSubmit',
  });

  const vehicleOptions = useMemo<VehicleOption[]>(() => {
    const cars = carsQuery.data;
    if (!Array.isArray(cars)) return [];
    return cars
      .map((car) => mapUserCarToVehicleOption(car))
      .filter((option): option is VehicleOption => option !== null);
  }, [carsQuery.data]);

  const [originLocation, setOriginLocation] = useState<MapLocation | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<MapLocation | null>(null);
  const [pickerTarget, setPickerTarget] = useState<LocationPickerTarget>(null);

  // Hydrate the local map-location state from the trip once it loads so we
  // can ship lat/lng on submit even if the user never re-touches the field.
  useEffect(() => {
    if (!trip) return;
    setOriginLocation(pointToMapLocation(trip.origin));
    setDestinationLocation(pointToMapLocation(trip.destination));
  }, [trip]);

  const openPicker = useCallback((target: Exclude<LocationPickerTarget, null>) => {
    setPickerTarget(target);
  }, []);
  const closePicker = useCallback(() => {
    setPickerTarget(null);
  }, []);

  const applyPlaceSelection = useCallback(
    (target: 'origin' | 'destination', location: MapLocation) => {
      if (target === 'origin') {
        form.setValue('origin', location.address, { shouldValidate: true });
        setOriginLocation(location);
      } else {
        form.setValue('destination', location.address, { shouldValidate: true });
        setDestinationLocation(location);
      }
    },
    [form],
  );

  const clearPlaceSelection = useCallback(
    (target: 'origin' | 'destination') => {
      if (target === 'origin') {
        form.setValue('origin', '', { shouldValidate: true });
        setOriginLocation(null);
      } else {
        form.setValue('destination', '', { shouldValidate: true });
        setDestinationLocation(null);
      }
    },
    [form],
  );

  const handleConfirmMapLocation = useCallback(
    (location: MapLocation) => {
      if (pickerTarget === 'origin' || pickerTarget === 'destination') {
        applyPlaceSelection(pickerTarget, location);
      }
      setPickerTarget(null);
    },
    [applyPlaceSelection, pickerTarget],
  );

  const onSubmit = useCallback(async () => {
    if (!tripId) return;
    await form.handleSubmit(async (parsed) => {
      const selectedVehicleOption = vehicleOptions.find(
        (option) => option.value === parsed.vehicle,
      );
      if (!selectedVehicleOption) {
        form.setError('vehicle', { message: 'required' });
        return;
      }

      try {
        await updateTrip.mutateAsync({
          tripId,
          carId: selectedVehicleOption.id,
          // Preserve the existing seat count: the form does not surface a
          // seats input, but `buildUpdateTripBody` defaults to 3, which would
          // silently downgrade trips with more seats. Pass through whatever
          // the trip already has so the PATCH is a no-op for this field.
          seatsOffered: typeof trip?.seatsOffered === 'number' ? trip.seatsOffered : undefined,
          origin: {
            label: parsed.origin,
            lat: originLocation?.latitude ?? 0,
            lng: originLocation?.longitude ?? 0,
          },
          destination: {
            label: parsed.destination,
            lat: destinationLocation?.latitude ?? 0,
            lng: destinationLocation?.longitude ?? 0,
          },
          preferences: {
            smoker: parsed.preferences.smoker,
            conversationStyle: parsed.preferences.conversationStyle,
            musicGenres: parsed.preferences.musicGenres,
          },
        });
      } catch {
        // Surfaced via `updateTrip.error` in the UI.
      }
    })();
  }, [destinationLocation, form, originLocation, trip, tripId, updateTrip, vehicleOptions]);

  return {
    form,
    tripQuery,
    vehicleOptions,
    updateTripPending: updateTrip.isPending,
    updateTripError: updateTrip.error,
    updateTripIsSuccess: updateTrip.isSuccess,
    originLocation,
    destinationLocation,
    pickerTarget,
    openPicker,
    closePicker,
    handleConfirmMapLocation,
    applyPlaceSelection,
    clearPlaceSelection,
    onSubmit,
  };
}
