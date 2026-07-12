# User ratings (post-ride)

**Date:** 2026-05-25
**Status:** planned
**Branch:** `feat/user-ratings`
**Scope:** US-07 (rate counter-party after completed ride), US-08
(rating summary on profile), US-09 (admin user ratings list)

## Goal

Let drivers rate the passengers they carried and passengers rate the
driver after a `COMPLETED` ride. Aggregate visible on user profiles
(authenticated read); admin dashboard exposes the full per-user list
including comments. Single backend PR; one frontend PR follows. Tight
API surface, no edit/delete, no notifications.

## Decisions (locked)

| Question                              | Answer                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| Direction                             | driver ↔ boarded passenger only (no passenger ↔ passenger)         |
| Scale                                 | integer 1–5                                                        |
| Comment                               | optional, ≤ 500 chars                                              |
| One rating per `(ride, rater, ratee)` | yes — partial unique index                                         |
| Window after completion               | no deadline (rateable forever)                                     |
| Edit / delete                         | not supported in v1                                                |
| Profile visibility                    | aggregate (avg + count) readable by any authenticated user         |
| Comment visibility                    | admin dashboard only — not exposed on `/users/:id/ratings/summary` |
| Counters                              | computed on read (indexed); no denormalised counter on `user`      |
| Push notification when rated          | out of scope                                                       |

## Data model

`user_ratings`:

| Column       | Type               | Notes                                    |
| ------------ | ------------------ | ---------------------------------------- |
| `id`         | text pk            |                                          |
| `ride_id`    | text → `rides.id`  |                                          |
| `rater_id`   | text → `user.id`   | who is rating                            |
| `ratee_id`   | text → `user.id`   | who is being rated                       |
| `score`      | int (1–5)          | check constraint `score BETWEEN 1 AND 5` |
| `comment`    | text null          | optional                                 |
| `created_at` | timestamp not null |                                          |

Indexes:

- Unique `(ride_id, rater_id, ratee_id)` — enforces one-shot per pair per ride.
- `(ratee_id, created_at desc)` — drives summary aggregate and admin list pagination.

No `updated_at`, no soft-delete column — v1 ratings are immutable.

## API surface

User routes are cookie-authed (`@ApiCookieAuth`, `@Session()`).
Admin routes additionally require the admin role guard the project
already uses (search for the existing admin guard before adding one).

| Method & path                            | Purpose                                                 |
| ---------------------------------------- | ------------------------------------------------------- |
| `POST /api/rides/:rideId/ratings`        | `{ rateeUserId, score, comment? }` — submit a rating    |
| `GET /api/me/ratings/summary`            | `{ averageScore, count }` for the current user as ratee |
| `GET /api/users/:userId/ratings/summary` | same shape for any user                                 |
| `GET /api/admin/users/:userId/ratings`   | paginated full list (admin only)                        |

`POST` returns `201` with the created rating. `GET …/summary` returns
`{ averageScore: number | null, count: number }` — `averageScore` is
`null` (not `0`) when `count === 0` so the FE can render "no ratings
yet" without a special case.

The admin list returns the same shape as a normal paginated list in
the project — copy the existing pagination DTO style (e.g.
`{ items, nextCursor }` or `{ items, page, total }`); do not invent a
new one.

## Eligibility

`POST /rides/:rideId/ratings` enforces, in this order:

1. Ride exists and `status === 'completed'`. Else `400 RATING_NOT_ELIGIBLE`.
2. Rater is a participant of the ride:
   - The trip's driver, OR
   - A passenger with `bookings.boarded_at IS NOT NULL` on the ride.
     Else `403 FORBIDDEN`.
3. Ratee is the counter-party:
   - If rater is the driver → ratee must be a boarded passenger of the ride.
   - If rater is a passenger → ratee must be the trip's driver.
     Else `400 RATING_NOT_ELIGIBLE`.
4. No existing rating row for `(ride_id, rater_id, ratee_id)`. Else `409 RATING_ALREADY_SUBMITTED`.
5. `score ∈ {1,2,3,4,5}` (`class-validator` `@Min(1) @Max(5) @IsInt()`); else surfaced as standard `400 VALIDATION_FAILED`. The dedicated `RATING_RANGE_INVALID` code is reserved if a non-validator path needs to throw the same intent (currently no such path — listed for completeness, can be dropped if unused).

The unique index is the final backstop for step 4 — race between two
parallel submits resolves with a `23505` on the second, mapped to
`RATING_ALREADY_SUBMITTED`. Catch and translate in the service.

## Error codes (new)

Add to `src/shared/errors/error-codes.ts`:

- `RATING_NOT_ELIGIBLE` — bucket for "ride isn't completed" and "ratee isn't the counter-party". `details` carries `{ reason: 'ride_not_completed' | 'not_counterparty' }` so the FE can render copy.
- `RATING_ALREADY_SUBMITTED` — duplicate submission; HTTP 409.

Drop `RATING_RANGE_INVALID` unless a path actually throws it; otherwise the standard `VALIDATION_FAILED` covers the score boundaries.

## Module layout

```
src/modules/ratings/
  ratings.module.ts
  ratings.types.ts                 // RATING_SCORE_MIN, RATING_SCORE_MAX
  ratings.controller.ts            // POST + the two summary GETs
  ratings.admin.controller.ts      // admin paginated list
  ratings.service.ts               // eligibility + write + aggregate
  ratings.repository.ts            // insert, summary aggregate, list
  ratings.mapper.ts
  dto/
    create-rating.dto.ts
    rating-response.dto.ts
    rating-summary-response.dto.ts
    admin-ratings-query.dto.ts
```

Register `RatingsModule` from `AppModule`. It depends on the trips/
bookings/rides shared schema (read-only joins for eligibility); do not
import `TripsModule` — pull the data via a repository method that
joins schemas directly, same convention as `incidents.repository.ts`.

## Tests

Domain unit specs colocated as `*.spec.ts`:

- `RatingsService` eligibility resolver — full truth table:
  - driver rates boarded passenger → OK
  - boarded passenger rates driver → OK
  - non-boarded passenger rates driver → 403
  - driver rates non-boarded passenger → 400 NOT_ELIGIBLE
  - passenger rates another passenger → 400 NOT_ELIGIBLE
  - random user rates participant → 403
  - rates self → 400 NOT_ELIGIBLE
  - ride not completed → 400 NOT_ELIGIBLE
  - duplicate submit → 409 ALREADY_SUBMITTED
- Aggregate calculation — handles empty (`{ averageScore: null, count: 0 }`), single row, many rows; rounding to 2 decimals.

One e2e in `test/ratings.e2e-spec.ts` using the existing helpers:

- Full happy path: book → boarding → complete → both sides rate → summary updates.
- Negative paths covering the eligibility branches above (a subset, not exhaustive).
- Admin list happy path + non-admin gets 403.

`pnpm lint && pnpm type-check && pnpm test && pnpm test:e2e` green before final commit.

## Docs to update

- `docs/db-diagram.md` — new `user_ratings` table.
- `docs/conceptual-diagram.md` — Rating concept + read-only aggregate on profile.
- `docs/architecture.md` — add `ratings` to the module list.
- `docs/error-handling.md` — `RATING_NOT_ELIGIBLE` payload shape.

## Out of scope

- Editing or deleting ratings.
- Passenger ↔ passenger ratings.
- Anonymous ratings.
- Reply / dispute flow.
- Push or email notification on receiving a rating.
- Reputation gating (e.g. "drivers below 3 stars can't publish") — UX-level decision, no backend logic in v1.
- Comment moderation (admin can read but not redact in v1).
- Denormalised aggregate counters on `user` — not needed at this scale; revisit if `(ratee_id, created_at desc)` index isn't enough.

## Phases

One backend PR (this plan) → one frontend PR. The backend PR includes
the migration, all endpoints, unit + e2e tests, and the doc updates
above.
