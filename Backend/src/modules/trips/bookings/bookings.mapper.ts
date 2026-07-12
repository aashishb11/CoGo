import type { Booking } from '@core/database/schema/bookings.schema';
import type { BookingResponseDto } from './dto/bookings-response.dto';

type RideEnrichment = {
  tripId: string;
  scheduledDeparture: Date;
};

export const toBookingResponse = (
  booking: Booking,
  ride: RideEnrichment,
): BookingResponseDto => ({
  id: booking.id,
  passengerId: booking.passengerId,
  rideId: booking.rideId,
  tripId: ride.tripId,
  status: booking.status,
  message: booking.message ?? null,
  requestedAt: booking.requestedAt,
  acceptedAt: booking.acceptedAt ?? null,
  rejectedAt: booking.rejectedAt ?? null,
  cancelledAt: booking.cancelledAt ?? null,
  boardedAt: booking.boardedAt ?? null,
  fareCents: booking.fareCents ?? null,
  scheduledDeparture: ride.scheduledDeparture,
});
