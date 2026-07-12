import { z } from 'zod';

import { NonEmptyTrimmedString, TimeSchema } from '@/shared/schemas/common';

// Wire-format enums — keep in sync with the DriverMusicGenre / ConversationStyle
// type unions in `lib/api/trips.ts`. Once OpenAPI codegen lands, these will be
// replaced by generated types.
export const DriverMusicGenreSchema = z.enum(['pop', 'reggaeton', 'rock', 'electronic', 'indie']);
export const ConversationStyleSchema = z.enum(['quiet', 'casual', 'chatty']);

export const TripPreferencesSchema = z.object({
  smoker: z.boolean(),
  conversationStyle: ConversationStyleSchema,
  musicGenres: z.array(DriverMusicGenreSchema),
});
export type TripPreferencesInput = z.infer<typeof TripPreferencesSchema>;

// `normalizeTripPoint` accepted undefined lat/lng and coerced them to 0.
// `z.number().default(0)` reproduces that: missing / `undefined` → 0.
export const TripPointSchema = z.object({
  label: NonEmptyTrimmedString,
  lat: z.number().default(0),
  lng: z.number().default(0),
});
export type TripPointInput = z.infer<typeof TripPointSchema>;

// The form hands us an array of weekday indices `0..6` where
// `0 = Monday`, `1 = Tuesday`, ..., `6 = Sunday`. This mirrors the mapping
// used by the old `normalizeRecurringDays` helper in `lib/trips-api.ts` —
// verified against `lib/api/trips.ts` before finalizing.
export const RecurringDaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, { message: 'at_least_one_day' })
  .transform((days) => {
    const set = new Set(days);
    return {
      monday: set.has(0),
      tuesday: set.has(1),
      wednesday: set.has(2),
      thursday: set.has(3),
      friday: set.has(4),
      saturday: set.has(5),
      sunday: set.has(6),
    };
  });

const CreateDriverTripSharedSchema = z.object({
  carId: NonEmptyTrimmedString,
  origin: TripPointSchema,
  destination: TripPointSchema,
  pricePerSeatCents: z.number().int().min(0),
  preferences: TripPreferencesSchema,
  seatsOffered: z.number().int().min(1).max(9).optional(),
});

export const CreateRecurringTripSchema = CreateDriverTripSharedSchema.extend({
  type: z.literal('recurring'),
  // `days` outputs the RecurringDaysDto shape directly (not number[]).
  days: RecurringDaysSchema,
  time: TimeSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'invalid_date' }),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'invalid_date' }),
});

export const CreateSporadicTripSchema = CreateDriverTripSharedSchema.extend({
  type: z.literal('sporadic'),
  departureAt: z.coerce.date(),
});

export const CreateDriverTripSchema = z.discriminatedUnion('type', [
  CreateRecurringTripSchema,
  CreateSporadicTripSchema,
]);
export type CreateDriverTripInput = z.infer<typeof CreateDriverTripSchema>;

export const FindPassengerTripsSchema = z.object({
  origin: TripPointSchema,
  destination: TripPointSchema,
  days: z.array(z.number().int().min(0).max(6)).min(1),
  time: TimeSchema,
  preferences: TripPreferencesSchema,
});
export type FindPassengerTripsInput = z.infer<typeof FindPassengerTripsSchema>;

// Wire-format input for the `GET /api/rides` ride-search endpoint. Lat/lng are
// required (not defaulted to 0 like in TripPointSchema) because the endpoint
// rejects null-island coordinates as "no rides found". Preferences are NOT
// part of the request — the backend doesn't accept them as query params, so
// we filter the response client-side in the find-trips screen.
export const RideSearchPointSchema = z.object({
  label: NonEmptyTrimmedString,
  lat: z.number().refine((value) => value !== 0, { message: 'invalid_location' }),
  lng: z.number().refine((value) => value !== 0, { message: 'invalid_location' }),
});

export const FindRidesSchema = z.object({
  origin: RideSearchPointSchema,
  destination: RideSearchPointSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'invalid_date' }),
  radiusKm: z.number().min(1).max(100),
  seatsNeeded: z.number().int().min(1).max(9),
});
export type FindRidesInput = z.infer<typeof FindRidesSchema>;
