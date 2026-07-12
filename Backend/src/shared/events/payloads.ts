import { DOMAIN_EVENTS } from './event-names';

/**
 * Payload shapes for domain events, keyed by the values exported from
 * `event-names.ts`. Add a new entry here whenever a new event lands.
 */
export interface DomainEventPayloads {
  [DOMAIN_EVENTS.RIDE_COMPLETED]: {
    rideId: string;
    driverId: string;
    recipientUserIds: string[];
    actualCo2SavedKg: number;
  };
}

export type RideCompletedPayload =
  DomainEventPayloads[typeof DOMAIN_EVENTS.RIDE_COMPLETED];
