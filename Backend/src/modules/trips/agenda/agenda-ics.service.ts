import { Injectable } from '@nestjs/common';
import ical from 'ical-generator';
import type { AgendaItemDto } from './dto/agenda-response.dto';

// Namespace for VEVENT UIDs. Never resolved over the network — it only has
// to be globally unique and stable: changing it would orphan every event
// already synced into users' calendars.
const UID_DOMAIN = 'cogo.app';

// Used when a ride has no estimatedDurationMinutes so the VEVENT still has a
// sensible DTEND.
const FALLBACK_DURATION_MINUTES = 30;

@Injectable()
export class AgendaIcsService {
  build(items: AgendaItemDto[]): string {
    const calendar = ical({ name: 'CoGo agenda' });

    for (const item of items) {
      const start = item.scheduledDeparture;
      const durationMinutes =
        item.estimatedDurationMinutes ?? FALLBACK_DURATION_MINUTES;
      const end = new Date(start.getTime() + durationMinutes * 60_000);

      calendar.createEvent({
        id: `ride-${item.rideId}@${UID_DOMAIN}`,
        start,
        end,
        summary: this.summary(item),
        location: item.origin.label,
        description: this.description(item),
      });
    }

    return calendar.toString();
  }

  private summary(item: AgendaItemDto): string {
    const route = `${item.origin.label} → ${item.destination.label}`;
    return item.role === 'driver' ? `Driving: ${route}` : `Ride: ${route}`;
  }

  private description(item: AgendaItemDto): string {
    if (item.role === 'driver') {
      return [
        'Role: driver',
        `Seats: ${item.seatsOccupied}/${item.seatsOffered}`,
        `Pending requests: ${item.pendingBookingCount}`,
      ].join('\n');
    }

    const lines = [
      'Role: passenger',
      `Driver: ${item.driver.name}`,
      `Booking status: ${item.myBookingStatus}`,
    ];
    if (item.car) {
      lines.push(
        `Car: ${item.car.brand} ${item.car.model} (${item.car.plate})`,
      );
    }
    return lines.join('\n');
  }
}
