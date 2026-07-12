import { z } from 'zod';

import { PlateSchema } from '@/shared/schemas/common';

export const CreateCarSchema = z.object({
  modelId: z.string().min(1, { message: 'manageCars.form.modelPicker.required' }),
  plate: PlateSchema,
  passengerSeats: z.coerce.number().int().min(1).max(9),
  // The old `createUserCar` only set `color` on the payload when the trimmed
  // value was non-empty. We mirror that by dropping empty strings first.
  color: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});
export type CreateCarInput = z.infer<typeof CreateCarSchema>;
export const UpdateCarSchema = CreateCarSchema;
export type UpdateCarInput = z.infer<typeof UpdateCarSchema>;

// Form state shape *before* schema parse — `<TextInput>` values are strings,
// the schema coerces `passengerSeats` to a number at parse time. `modelId` is
// set programmatically when the user picks a result from the autocomplete, so
// the form starts with an empty string and the picker handles validation.
export type CreateCarFormValues = {
  modelId: string;
  plate: string;
  passengerSeats: string;
  color?: string;
};
