# Partner Rides API

**Date:** 2026-05-21
**Status:** planned

## Goal

Expose a small, stable subset of the rides data to an external application
(an events platform — concerts, etc.) so it can show its users CoGo rides to
the events it lists. The partner filters the same way our app does: origin,
destination, date, radius.

## Decisions (locked)

| Question       | Answer                                        |
| -------------- | --------------------------------------------- |
| Auth           | Static API key, `Authorization: Bearer <key>` |
| Endpoints      | Ride search + ride detail                     |
| Key management | Single seeded key (one known partner)         |
| Rate limiting  | Deferred — not in this work                   |

## Industry-standard shape

This is a **partner API**: a versioned, separately-namespaced, separately-
documented, separately-authenticated subset of the backend.

- **Namespace:** `/api/partner/v1/...` — version in the path is the de-facto
  standard and lets the internal API evolve without breaking the partner.
- **No subdomain.** We run a single Render free-tier service; a subdomain
  would add DNS/TLS/routing for no benefit. A path prefix is the clean choice.
- **Auth is server-to-server.** Session cookies (`better-auth.session_token`)
  are for the mobile app and have no meaning here. The partner's _backend_
  holds the key and proxies requests — the key must never ship to their
  client (a browser/app leaking it would expose the key publicly).
- **Docs are separate.** A dedicated, filtered Scalar page at
  `/api/docs/partner` showing _only_ partner endpoints, so the partner never
  sees internal routes.

## Architecture

New top-level module `src/modules/partner/`. It is a thin adapter — it owns
auth, the public contract, and docs, but **reuses `RidesService` for all
logic** (the search by origin/destination/date/radius already exists in
`RideSearchQueryDto` + `RidesService.search()`).

```
src/modules/partner/
  partner.module.ts
  partner.controller.ts        @Controller('partner/v1/rides')
  partner-key.guard.ts         Bearer-token guard
  partner.mapper.ts            internal ride DTO -> public DTO
  dto/
    partner-ride.dto.ts        PartnerRideDto, PartnerRideSearchResponseDto
```

### Endpoints

| Method | Path                            | Reuses                         |
| ------ | ------------------------------- | ------------------------------ |
| `GET`  | `/api/partner/v1/rides`         | `RidesService.search(query)`   |
| `GET`  | `/api/partner/v1/rides/:rideId` | `RidesService.getById(rideId)` |

`/api/` is NestJS's global prefix; `partner/v1/rides` is the controller path.

### Auth — `PartnerKeyGuard`

- Reads `Authorization: Bearer <token>`.
- Constant-time compares (`crypto.timingSafeEqual`, length-guarded) against
  the `PARTNER_API_KEY` env var.
- Throws `UnauthorizedException` on missing/malformed/wrong key — the existing
  `GlobalExceptionFilter` renders it as a standard `ErrorResponseDto` (401).
- The key is a single shared secret living in an env var; the env var _is_ the
  secret store, so hashing it at rest would be empty ceremony. Plaintext env
  var + timing-safe compare is correct here.

Each partner route is decorated with `@AllowAnonymous()` so the global
better-auth `AuthGuard` skips it, then `@UseGuards(PartnerKeyGuard)` applies
our own check. (`@AllowAnonymous` is the pattern already used by
`health.controller.ts`.)

CORS: unchanged — this is server-to-server, and CORS is browser-only.

### Public response contract — `PartnerRideDto`

Deliberately **separate** from `RideSearchItemDto` / `RideDetailResponseDto`.
Internal DTOs change whenever the mobile app needs something new; a partner
contract must not break when that happens. This is a conscious exception to
the `AGENTS.md` DRY rule — DRY applies to the _logic_ (we reuse `RidesService`),
not to a contract that has a different audience and stability guarantee. A
one-line comment in the mapper will point back to this plan.

Proposed shape (trimmed, stable, no internal IDs / lifecycle noise):

```
PartnerRideDto
  id: string
  departureTime: string (ISO)
  status: 'active' | 'completed' | 'cancelled'
  origin: { lat, lng, address }
  destination: { lat, lng, address }
  totalDistanceKm: number
  availableSeats: number          // seatsOffered - seatsOccupied
  driverName: string
  driverOrganization: string | null
  smokeAllowed: boolean
  musicAllowed: boolean
```

Search returns `{ items: PartnerRideDto[], page, limit, total }`; detail
returns a single `PartnerRideDto`. Excluded on purpose: `driverId`, internal
`tripId`, `actualCo2SavedKg`, `cancellationReason`, conversation style, music
genre. Final field list is tunable once the partner confirms what they render.

### Docs — `/api/docs/partner`

In `src/docs.ts`:

- Tag the partner controller `@ApiTags('Partner')` and `@ApiBearerAuth(...)`.
- Add `.addBearerAuth(...)` to the shared `DocumentBuilder` (harmless — only
  operations decorated with `@ApiBearerAuth()` reference the scheme).
- Build a filtered copy of `mergedDocument` keeping only `Partner`-tagged
  operations, with its own title/description, and mount a second Scalar:
  `app.use('/api/docs/partner', apiReference({ content: partnerDoc }))`.
- **Mount `/api/docs/partner` before `/api/docs`** — `/api/docs` is a prefix
  match and would otherwise shadow it (same gotcha already documented for
  `/api/docs/ws`).

The main `/api/docs` keeps everything (internal devs see the whole API).

## Steps

1. `env.validation.ts` + `.env.example`: add `PARTNER_API_KEY` (required
   string). Set it in the Render dashboard for prod.
2. `TripsModule`: add `RidesService` to `exports` (currently only
   `TripsRepository` is exported).
3. `partner-ride.dto.ts` + `partner.mapper.ts`.
4. `partner-key.guard.ts`.
5. `partner.controller.ts` — two routes, `@AllowAnonymous()` +
   `@UseGuards(PartnerKeyGuard)`, reusing `RideSearchQueryDto` as the query
   DTO, Swagger decorators (`@ApiTags('Partner')`, `@ApiBearerAuth`,
   `@ApiOkResponse`, `@ApiUnauthorizedResponse`).
6. `partner.module.ts` — imports `TripsModule`, declares the controller +
   guard; register `PartnerModule` in `AppModule`.
7. `docs.ts` — filtered partner Scalar page.
8. Tests: `partner-key.guard.spec.ts` (valid / missing / wrong key) and a
   controller/e2e test for both routes. `pnpm lint && pnpm test`.
9. Add a one-line mention to `docs/architecture.md` if it enumerates modules.

## Out of scope

- Rate limiting (deferred).
- Multi-partner support / `partner` DB table / admin key CRUD — a single
  seeded env-var key covers the one known consumer.
- Booking through the partner API (would need cross-app user identity).

## Note for the team

This is a distinct, user-facing capability — it likely warrants its own Taiga
story rather than being folded into the rides module's work.

## 2026-05-25 — Route geometry addendum

Partner (Breeze) asked for the driving route so they can draw it on their map.
`PartnerRideDto` now carries both formats — they prefer the array but wanted
the polyline too for flexibility:

- `routePolyline`: encoded polyline (Google precision-5), passed through from
  the trip's stored value.
- `routeCoordinates`: `[lat, lng][]`, decoded server-side from `routePolyline`
  so the partner front-end doesn't need a decoder dependency.

Both are nullable (older trips with no computed route, or future routing
failures, return `null` for both). Decoding is done by `partner/polyline.ts`
(inline ~30-line implementation of the Google polyline algorithm — not worth
a dependency).

The internal `TripSummaryDto` also gained `routePolyline` so the value flows
through the existing rides search/detail pipeline without an extra DB call;
this is a purely additive change to the internal contract.
