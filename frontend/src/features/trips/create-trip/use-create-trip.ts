import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useSession } from '@/features/auth/queries';
import { type UserCar } from '@/features/cars/api';
import { useCars } from '@/features/cars/queries';
import {
  type ConversationStyle,
  type MapLocation,
  type MusicPreference,
} from '@/features/trips/create-trip/types';
import { useCreateDriverTrip } from '@/features/trips/queries';
import { ConversationStyleSchema, DriverMusicGenreSchema } from '@/features/trips/schemas';
import { TimeSchema } from '@/shared/schemas/common';

// Presentational model for a selectable vehicle pill. Kept inline with the
// hook because `features/trips/create-trip` is the only consumer.
export type VehicleOption = {
  id: string;
  name: string;
  plate: string;
  value: string;
  isBackend?: boolean;
};

// Form-layer schema. The canonical `CreateDriverTripSchema` transforms
// `days: number[]` into a `RecurringDaysDto` object, which would make the
// form state unusable in the UI (the weekday chips index by number).
// Instead, the form keeps the raw UI shape and is re-validated through the
// canonical schema only at mutation time (inside `createDriverTrip`).
//
// Create is driver-only — the user is offering a ride. Passenger search
// lives on the Find tab (`find-trips-screen.tsx`).
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function startOfTodayIsoLocal(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const CreateTripFormSchema = z
  .object({
    mode: z.enum(['recurring', 'sporadic']),
    origin: z.string().trim().min(1, { message: 'required' }),
    destination: z.string().trim().min(1, { message: 'required' }),
    time: TimeSchema,
    days: z.array(z.number().int().min(0).max(6)),
    date: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    pricePerSeatEuros: z.string().trim().regex(/^\d+$/, { message: 'required' }),
    vehicle: z.string(),
    preferences: z.object({
      smoker: z.boolean(),
      conversationStyle: ConversationStyleSchema,
      musicGenres: z.array(DriverMusicGenreSchema),
    }),
  })
  .superRefine((value, ctx) => {
    const todayIso = startOfTodayIsoLocal();
    if (value.mode === 'recurring') {
      if (value.days.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['days'],
          message: 'at_least_one_day',
        });
      }
      if (!ISO_DATE_RE.test(value.startDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startDate'],
          message: 'invalid_date',
        });
      } else if (value.startDate < todayIso) {
        // Recurring: start date can't be in the past. The time-of-day applies
        // to each weekday going forward, so we don't enforce "time >= now"
        // here — past instances are filtered server-side.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startDate'],
          message: 'past_date',
        });
      }
      if (!ISO_DATE_RE.test(value.endDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: 'invalid_date',
        });
      } else if (ISO_DATE_RE.test(value.startDate) && value.endDate <= value.startDate) {
        // End must be strictly after start — a one-day recurring schedule
        // isn't meaningful (use a sporadic trip instead).
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: 'before_start_date',
        });
      }
      return;
    }

    // Sporadic
    if (!ISO_DATE_RE.test(value.date)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['date'],
        message: 'invalid_date',
      });
      return;
    }
    if (value.date < todayIso) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['date'],
        message: 'past_date',
      });
      return;
    }
    if (value.date === todayIso) {
      // Same-day departure: time must be in the future.
      const now = new Date();
      const minutesNow = now.getHours() * 60 + now.getMinutes();
      const [hRaw, mRaw] = value.time.split(':');
      const minutesPicked = Number(hRaw) * 60 + Number(mRaw);
      if (Number.isFinite(minutesPicked) && minutesPicked < minutesNow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['time'],
          message: 'past_time',
        });
      }
    }
  });

export type CreateTripFormValues = z.input<typeof CreateTripFormSchema>;
export type CreateTripFormOutput = z.output<typeof CreateTripFormSchema>;

export const WEEKDAY_LABELS: Record<'es' | 'en' | 'ca', string[]> = {
  es: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  ca: ['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'],
};

export const MUSIC_OPTIONS: { value: MusicPreference; labelKey: string }[] = [
  { value: 'pop', labelKey: 'createTrip.preferences.music.pop' },
  { value: 'reggaeton', labelKey: 'createTrip.preferences.music.reggaeton' },
  { value: 'rock', labelKey: 'createTrip.preferences.music.rock' },
  { value: 'electronic', labelKey: 'createTrip.preferences.music.electronic' },
  { value: 'indie', labelKey: 'createTrip.preferences.music.indie' },
];

export const CONVERSATION_OPTIONS: {
  value: ConversationStyle;
  labelKey: string;
}[] = [
  { value: 'quiet', labelKey: 'createTrip.preferences.conversation.quiet' },
  { value: 'casual', labelKey: 'createTrip.preferences.conversation.casual' },
  { value: 'chatty', labelKey: 'createTrip.preferences.conversation.chatty' },
];

// Compute default dates at module load time: start = today, end = today + 3 months
function getDefaultDates() {
  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  const endDate = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())
    .toISOString()
    .split('T')[0];
  return { startDate, endDate };
}

const DEFAULT_VALUES: CreateTripFormValues = {
  mode: 'recurring',
  origin: '',
  destination: '',
  time: '09:00',
  days: [],
  date: '',
  startDate: getDefaultDates().startDate,
  endDate: getDefaultDates().endDate,
  pricePerSeatEuros: '',
  vehicle: '',
  preferences: {
    smoker: false,
    conversationStyle: 'casual',
    musicGenres: [],
  },
};

function mapUserCarToVehicleOption(car: UserCar): VehicleOption | null {
  const id = typeof car.id === 'string' ? car.id.trim() : '';
  if (!id) {
    return null;
  }

  const brand = car.model?.brand?.trim() ?? '';
  const modelName = car.model?.name?.trim() ?? '';
  const plate = typeof car.plate === 'string' ? car.plate.trim() : '';

  const name = [brand, modelName].filter(Boolean).join(' ').trim() || plate || '—';
  const safePlate = plate || '—';

  return {
    id,
    name,
    plate: safePlate,
    isBackend: true,
    value: id,
  };
}

export type LocationPickerTarget = 'origin' | 'destination' | null;

export type UseCreateTripResult = {
  form: ReturnType<typeof useForm<CreateTripFormValues>>;
  // Vehicle list
  vehicleOptions: VehicleOption[];
  // Mutation state
  createTripPending: boolean;
  createTripError: unknown;
  createTripIsSuccess: boolean;
  resetCreateTripError: () => void;
  // Location map state
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
  // Event context (set via setEventId when arriving from an event-detail screen)
  setEventId: (id: string) => void;
  // Submit
  onSubmit: () => Promise<void>;
};

export function useCreateTrip(): UseCreateTripResult {
  const session = useSession();
  const userId = session.data?.user?.id ?? null;

  const form = useForm<CreateTripFormValues>({
    resolver: zodResolver(CreateTripFormSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onSubmit',
  });

  const carsQuery = useCars(userId);
  const createTrip = useCreateDriverTrip(userId);

  const vehicleOptions = useMemo<VehicleOption[]>(() => {
    const cars = carsQuery.data;
    if (!Array.isArray(cars)) {
      return [];
    }
    return cars
      .map((car) => mapUserCarToVehicleOption(car))
      .filter((option): option is VehicleOption => option !== null);
  }, [carsQuery.data]);

  const [originLocation, setOriginLocation] = useState<MapLocation | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<MapLocation | null>(null);
  const [pickerTarget, setPickerTarget] = useState<LocationPickerTarget>(null);
  // Tracks the CultuCat eventId when the user arrives from an event-detail screen.
  // Not part of the form schema — backend only needs it at submit time.
  const eventIdRef = useRef<string>('');

  const setEventId = useCallback((id: string) => {
    eventIdRef.current = id;
  }, []);

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

  const resetFormState = useCallback(() => {
    form.reset(DEFAULT_VALUES);
    setOriginLocation(null);
    setDestinationLocation(null);
    eventIdRef.current = '';
  }, [form]);

  const onSubmit = useCallback(async () => {
    await form.handleSubmit(async (parsed) => {
      // `parsed` is the Zod output — `time` is padded, `origin`/`destination`
      // are trimmed via the schema.
      const preferencesPayload = {
        smoker: parsed.preferences.smoker,
        conversationStyle: parsed.preferences.conversationStyle,
        musicGenres: parsed.preferences.musicGenres,
      };

      const selectedVehicleOption = vehicleOptions.find(
        (option) => option.value === parsed.vehicle,
      );
      if (!selectedVehicleOption) {
        form.setError('vehicle', { message: 'required' });
        return;
      }

      const sharedPayload = {
        carId: selectedVehicleOption.id,
        origin: {
          label: parsed.origin,
          lat: originLocation?.latitude,
          lng: originLocation?.longitude,
        },
        destination: {
          label: parsed.destination,
          lat: destinationLocation?.latitude,
          lng: destinationLocation?.longitude,
        },
        pricePerSeatCents: Number(parsed.pricePerSeatEuros) * 100,
        preferences: preferencesPayload,
      };

      try {
        if (parsed.mode === 'sporadic') {
          // `time` defaults to '09:00' so the time-of-day still rides along
          // with the chosen calendar date in `departureAt`.
          const departureAt = new Date(`${parsed.date}T${parsed.time}:00`);
          const eventId = eventIdRef.current;
          await createTrip.mutateAsync({
            ...sharedPayload,
            type: 'sporadic',
            departureAt,
            ...(eventId ? { externalEventContext: { provider: 'cultucat', eventId } } : {}),
          });
        } else {
          await createTrip.mutateAsync({
            ...sharedPayload,
            type: 'recurring',
            time: parsed.time,
            days: [...parsed.days].sort((a, b) => a - b),
            startDate: parsed.startDate,
            endDate: parsed.endDate,
          });
        }
        resetFormState();
      } catch {
        // Surfaced via `createTrip.error` in the UI.
      }
    })();
  }, [createTrip, destinationLocation, form, originLocation, resetFormState, vehicleOptions]);

  return {
    form,
    vehicleOptions,
    createTripPending: createTrip.isPending,
    createTripError: createTrip.error,
    createTripIsSuccess: createTrip.isSuccess,
    resetCreateTripError: createTrip.reset,
    originLocation,
    destinationLocation,
    pickerTarget,
    openPicker,
    closePicker,
    handleConfirmMapLocation,
    applyPlaceSelection,
    clearPlaceSelection,
    setEventId,
    onSubmit,
  };
}
