/**
 * Catalog of domain event names. Reference these constants from emitters and
 * `@OnEvent(...)` listeners — never inline the string literals.
 */
export const DOMAIN_EVENTS = {
  RIDE_COMPLETED: 'ride.completed',
} as const;

export type DomainEventName =
  (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
