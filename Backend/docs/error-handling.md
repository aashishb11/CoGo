# Error handling

## Response shape

Every error response is normalized to:

```json
{ "code": "STRING", "statusCode": 404, "message": "string", "details": null }
```

This is enforced by [`GlobalExceptionFilter`](../src/shared/errors/global-exception.filter.ts), registered in `main.ts`. Anything thrown from a controller or service flows through it, including unhandled exceptions (which become a logged `INTERNAL_ERROR`).

## Throwing errors

Throw NestJS exceptions from services. Two shapes:

**Generic** — when the FE just needs the HTTP status. Throw the NestJS exception directly with a plain message:

```ts
throw new NotFoundException('Trip not found');
```

The filter fills `code` from the status (`404 → NOT_FOUND`, `409 → CONFLICT`, etc.).

**Rich** — when the FE differentiates between failure modes at the same status. Use the typed helpers from [`src/shared/errors/throw.ts`](../src/shared/errors/throw.ts):

```ts
import { throwConflict } from '@shared/errors/throw';

throwConflict(
  'CAR_HAS_ACTIVE_TRIPS',
  'Car has active trips and cannot be deleted',
  { tripIds },
);
```

The first argument is `ErrorCode`-typed, so a typo or removed code fails at compile time. Available helpers: `throwBadRequest`, `throwUnauthorized`, `throwForbidden`, `throwNotFound`, `throwConflict`, `throwInternalServerError`.

Use a rich code when the FE needs to render a different UX per failure. Don't add codes for cases that are visually indistinguishable.

## Adding a new error code

Add it to `ERROR_CODES` in [`../src/shared/errors/error-codes.ts`](../src/shared/errors/error-codes.ts). The tuple is the single source of truth — DTOs that surface error codes (e.g., batch outcomes) derive from it via `satisfies readonly ErrorCode[]`, so a removal will fail compilation at every consumer.

## Validation errors

`class-validator` failures are surfaced by NestJS's `ValidationPipe` and normalized to `code: 'VALIDATION_FAILED'` with the field-level messages in `details.errors`. Don't catch or rethrow these.

## Rich payloads on specific codes

A few rich codes carry structured `details` that the FE depends on. Keep this list in sync when fields change:

- `INSUFFICIENT_WALLET_BALANCE` → `{ availableCents, pricePerSeatCents, shortfallCents }` from the booking-create precondition; `{ availableCents, shortfallCents }` from the withdrawal precondition. Surfaced both as a thrown `400` and as a per-item `BOOKING_SKIP_REASONS` value in the accept-batch outcome.
- `RIDE_NOT_DEPARTED` from `POST /rides/:id/start` carries `{ scheduledDeparture, windowStart, windowEnd }` so the FE can render "comes back in N minutes".
- `INCIDENT_WINDOW_CLOSED` from `POST /rides/:id/incidents` carries `{ rideStatus, completedAt }` so the FE can render "this happened too long ago to report" with the actual completion timestamp instead of a generic 400.
- `RATING_NOT_ELIGIBLE` from `POST /rides/:id/ratings` carries `{ reason: 'ride_not_completed' | 'not_counterparty' }` so the FE can pick the right copy. `ride_not_completed` fires when the ride hasn't yet reached `completed`; `not_counterparty` fires when the rater isn't the trip's driver/boarded-passenger counter-party of the ratee (and is also returned defensively if rater === ratee). Rater who wasn't on the ride at all gets `403 FORBIDDEN` instead. `RATING_ALREADY_SUBMITTED` (409) carries no details — the unique `(ride_id, rater_id, ratee_id)` index is the source of truth for duplicates.
