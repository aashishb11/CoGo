import { z } from 'zod';

export const CreateBookingsSchema = z.object({
  rideIds: z.array(z.string().trim().min(1)).min(1),
  message: z.string().trim().max(500).optional(),
});

export const BookingRequestMessageSchema = z.object({
  message: z.string().trim().max(500).optional(),
});

export const AcceptBookingsSchema = z.object({
  passengerId: z.string().trim().min(1),
  bookingIds: z.array(z.string().trim().min(1)).min(1).optional(),
});

export const RejectBookingsSchema = AcceptBookingsSchema.extend({
  rejectionReason: z.string().trim().max(500).optional(),
});

export type AcceptBookingsInput = z.input<typeof AcceptBookingsSchema>;
export type AcceptBookingsPayload = z.output<typeof AcceptBookingsSchema>;
export type CreateBookingsInput = z.input<typeof CreateBookingsSchema>;
export type CreateBookingsPayload = z.output<typeof CreateBookingsSchema>;
export type RejectBookingsInput = z.input<typeof RejectBookingsSchema>;
export type RejectBookingsPayload = z.output<typeof RejectBookingsSchema>;
