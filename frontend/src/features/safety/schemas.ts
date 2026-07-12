import { z } from 'zod';

export const IncidentCategorySchema = z.enum(['harassment', 'unsafe_driving', 'accident', 'other']);

export type IncidentCategory = z.infer<typeof IncidentCategorySchema>;

export const CreateIncidentSchema = z.object({
  category: IncidentCategorySchema,
  // Backend caps notes at 1000 chars; mirror it so the form catches it before
  // the round-trip.
  note: z
    .string()
    .trim()
    .max(1000, { message: 'safety.incidents.error.noteTooLong' })
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export type CreateIncidentInput = z.input<typeof CreateIncidentSchema>;
export type CreateIncidentPayload = z.output<typeof CreateIncidentSchema>;
