# Frontend integration — ride lifecycle, safety, and ratings

**Date:** 2026-05-25
**Status:** awaiting FE implementation
**Backend PRs:** #163 (merged — ride lifecycle + safety) and the
upcoming `feat/user-ratings` PR (ratings stories — backend in flight)
**Scope:**

- US-03, US-04, US-05, US-06 from `../../safety-and-payments.md`
- US-07 (rate driver/passenger after completed ride), US-08 (rating
  summary on profile), US-09 (admin user ratings) — see
  `./2026-05-25-user-ratings.md`

This guide tells the frontend what to add. The backend ships every
endpoint and DTO below; no FE code is in place yet. Delete this file
once the matching frontend PR(s) ship.

---

## Quick checklist

**Shipped (PR #163, on develop)**

- [ ] Trusted contact section in profile (US-05)
- [ ] Wallet UI: surface `heldCents` + handle `INSUFFICIENT_WALLET_BALANCE`
- [ ] Trip create form: required `pricePerSeatCents` field
- [ ] Driver: "Start ride" button on the active ride detail (US-04)
- [ ] Driver: "Complete ride" screen with per-passenger `unscannedOutcomes`
- [ ] Passenger: boarding-token QR on accepted bookings once ride is IN_PROGRESS (US-03)
- [ ] Driver: QR scanner on the in-progress ride (US-03)
- [ ] Incident-report sheet on in-progress and recently-completed rides (US-06)
- [ ] "My incidents" list in profile

**Upcoming (`feat/user-ratings`, in flight)**

- [ ] Post-completion rating sheet on the ride summary (driver rates each boarded passenger; passenger rates the driver)
- [ ] Aggregate rating block on the user profile (own + counter-party)
- [ ] Admin-dashboard user ratings list (per user, paginated, includes comments)

---

## 1. Trusted contact gate (US-05)

### Endpoints

| Method | Path                      | Auth    | Notes                                          |
| ------ | ------------------------- | ------- | ---------------------------------------------- |
| `GET`  | `/api/me/trusted-contact` | session | `200 { name, email, ... }` or `404` if none    |
| `PUT`  | `/api/me/trusted-contact` | session | Upserts. Body `{ name, email }`. Never clears. |

### UX

- Profile screen gains a "Trusted safety contact" section with name + email fields.
- The trusted contact is **a hard precondition for booking and trip publishing**. Both `POST /api/trips/:id/bookings` and `POST /api/trips` (create) return `403` with code `TRUSTED_CONTACT_REQUIRED` when no contact is set.
- On either 403, intercept inline: open a sheet/modal to set the contact, then retry the original action. The contact is set once and never clears, so the prompt trips at most once per user.

### Error codes to handle

| Code                       | HTTP | Where                                     |
| -------------------------- | ---- | ----------------------------------------- |
| `TRUSTED_CONTACT_REQUIRED` | 403  | `POST /trips`, `POST /trips/:id/bookings` |

### i18n keys (en/es/ca)

- `profile.trustedContact.title`
- `profile.trustedContact.subtitle`
- `profile.trustedContact.name`
- `profile.trustedContact.email`
- `profile.trustedContact.save`
- `error.trustedContactRequired`

---

## 2. Wallet — holds and shortfall (US-03 surface)

### `GET /api/me/wallet` response — new field

The response now includes `heldCents` (integer EUR cents) reserved against active bookings. Display `available = balanceCents − heldCents`. Don't let the user withdraw or top-up against held funds.

### Booking-create can return `INSUFFICIENT_WALLET_BALANCE`

`POST /api/trips/:id/bookings` now runs an upfront balance check:

```json
HTTP 400
{
  "code": "INSUFFICIENT_WALLET_BALANCE",
  "message": "...",
  "details": {
    "availableCents": 350,
    "pricePerSeatCents": 500,
    "shortfallCents": 150
  }
}
```

UX: deep-link to the top-up flow with `shortfallCents` pre-filled in the amount picker. After top-up succeeds, retry the booking automatically (or prompt to retry).

The per-item accept batch can also surface `BOOKING_SKIP_REASONS: 'INSUFFICIENT_WALLET_BALANCE'` for a funds race (passenger A drains the wallet between create and accept). Render the skipped item with a "funds dropped" message.

### Error codes

| Code                          | HTTP | Payload                                                 |
| ----------------------------- | ---- | ------------------------------------------------------- |
| `INSUFFICIENT_WALLET_BALANCE` | 400  | `{ availableCents, pricePerSeatCents, shortfallCents }` |

---

## 3. Trip fare — `pricePerSeatCents`

### DTO changes

- `POST /api/trips` and `PATCH /api/trips/:id` accept `pricePerSeatCents` (non-negative integer, EUR cents). **Required on create.** No upper bound.
- `Trip` response, trip search results, ride detail, and ride search items all include `pricePerSeatCents` (via the embedded trip summary on ride DTOs).

### UX

- Trip create form: add a "Fare per seat" input. Accept integer euros; convert to cents client-side before submitting. Show as €X.XX in trip and ride cards.
- Passenger booking flow: display the fare clearly before submit so the `INSUFFICIENT_WALLET_BALANCE` case doesn't surprise.

### i18n keys

- `trip.create.pricePerSeat.label`
- `trip.create.pricePerSeat.placeholder`
- `trip.detail.farePerSeat`

---

## 4. Ride lifecycle — start and complete (US-04)

### Start

| Method | Path                       | Auth               | Status guard     |
| ------ | -------------------------- | ------------------ | ---------------- |
| `POST` | `/api/rides/:rideId/start` | driver of the trip | ride is `ACTIVE` |

Window: `−30 min … +2 h` around `scheduledDeparture`. Outside → `400 RIDE_NOT_DEPARTED` with payload `{ scheduledDeparture, windowStart, windowEnd }`. Returns the ride detail (now in `IN_PROGRESS`).

UX:

- "Start ride" button on the driver's view of the active ride. Disabled outside the window — render a countdown ("Comes back at 09:30") from `windowStart`/`windowEnd`.
- Once started, hide "Cancel ride" — backend returns `RIDE_ALREADY_STARTED`.

### Complete (extended)

| Method | Path                          | Auth               | Status guard              |
| ------ | ----------------------------- | ------------------ | ------------------------- |
| `POST` | `/api/rides/:rideId/complete` | driver of the trip | `ACTIVE` or `IN_PROGRESS` |

Body shape changed:

```ts
{
  // ❌ removed: seatsOccupied (now computed server-side)
  unscannedOutcomes?: Array<{
    bookingId: string;
    outcome: 'refund' | 'boarded';
  }>;
  // existing optional fields stay the same
}
```

Semantics:

- Bookings already scanned at boarding (`boardedAt != null`): already captured, ignored by the override.
- Unscanned bookings: honour `unscannedOutcomes` if present, else apply the default — post-departure → captured (no-show), pre-departure → released (refund).

UX:

- Complete-ride screen lists all accepted bookings split into "scanned" and "unscanned".
- For each unscanned row, picker: "Boarded anyway" or "Refund". Pre-select the default based on ride time; let the driver override.
- Drop the manual `seatsOccupied` input. The server-computed count drives CO2 freeze.

### Cancel guard tightening

- `POST /api/rides/:rideId/cancel` now refuses with `400 RIDE_ALREADY_STARTED` once the ride is `IN_PROGRESS`.
- Passenger cancel (`POST /api/trips/:tripId/bookings/:bookingId/cancel`) refuses with the same code once the ride is `IN_PROGRESS` or `COMPLETED`.

### Error codes

| Code                   | HTTP | Payload                                          |
| ---------------------- | ---- | ------------------------------------------------ |
| `RIDE_NOT_DEPARTED`    | 400  | `{ scheduledDeparture, windowStart, windowEnd }` |
| `RIDE_ALREADY_STARTED` | 400  | —                                                |
| `RIDE_NOT_IN_PROGRESS` | 400  | (boarding scan path; see §5)                     |

### i18n keys

- `ride.driver.start.cta`
- `ride.driver.start.window.notYet`
- `ride.driver.start.window.tooLate`
- `ride.driver.complete.unscanned.section`
- `ride.driver.complete.unscanned.boarded`
- `ride.driver.complete.unscanned.refund`
- `error.rideNotDeparted`
- `error.rideAlreadyStarted`

---

## 5. Boarding QR (US-03)

### Passenger token

| Method | Path                                         | Auth                          | Notes                                                                    |
| ------ | -------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `GET`  | `/api/me/bookings/:bookingId/boarding-token` | session, passenger of booking | Booking `accepted`, ride `IN_PROGRESS`. Returns `{ token, validUntil }`. |

Token rotates every ~30 seconds. Poll just before `validUntil` (e.g. every 25 s) to keep a fresh QR on screen.

### Driver scan

| Method | Path                  | Auth                        | Notes                                                                  |
| ------ | --------------------- | --------------------------- | ---------------------------------------------------------------------- |
| `POST` | `/api/boarding-scans` | session, driver of the trip | Body `{ token }`. No `rideId` in the path — the token pins everything. |

Server side, the scan: verifies the token, captures the wallet hold (writes `payment`/`earning` ledger rows), stamps `bookings.boardedAt`. Idempotent: a second scan of the same booking returns `400 BOARDING_ALREADY_RECORDED`.

### UX

- Passenger: on accepted bookings, once the ride is `IN_PROGRESS`, expose "Show boarding QR" full-screen. Show `token` as a QR (the token is opaque to the FE — render it verbatim). Refresh tick from `validUntil`.
- Driver: from the in-progress ride detail, a "Scan boarding" CTA opens the camera, decodes the QR, POSTs the token. Success → toast with passenger name; error → toast with a code-specific message.

### Error codes

| Code                        | HTTP | Meaning                                   |
| --------------------------- | ---- | ----------------------------------------- |
| `BOARDING_TOKEN_INVALID`    | 400  | Token corrupt / expired / unknown booking |
| `BOARDING_ALREADY_RECORDED` | 400  | Already scanned; show "Already boarded"   |
| `RIDE_NOT_IN_PROGRESS`      | 400  | Ride hasn't started or already completed  |

### i18n keys

- `boarding.passenger.title`
- `boarding.passenger.refresh.hint`
- `boarding.driver.scan.cta`
- `boarding.driver.scan.success`
- `error.boardingTokenInvalid`
- `error.boardingAlreadyRecorded`
- `error.rideNotInProgress`

---

## 6. Incidents (US-06)

### Endpoints

| Method | Path                           | Auth                          | Notes                       |
| ------ | ------------------------------ | ----------------------------- | --------------------------- |
| `POST` | `/api/rides/:rideId/incidents` | session, eligible participant | Body `{ category, note? }`. |
| `GET`  | `/api/me/incidents`            | session                       | Paginated, newest first.    |

**Eligibility** (server-enforced; FE may hide the CTA when these are visibly false):

- Reporter is the trip driver, OR a passenger whose booking on that ride has `boardedAt != null`.
- Ride is `IN_PROGRESS` OR completed ≤ 24 h ago.

**Categories:** `'harassment' | 'unsafe_driving' | 'accident' | 'other'`. `note` is free-text, optional, capped server-side.

### UX

- "Report incident" entry-point on the ride detail screen — only when the user is eligible (driver, or boarded passenger) and the ride is in_progress / recently completed.
- Sheet: category picker (4 options, localised), optional note, submit.
- Confirmation toast: mention "We've notified your trusted contact" so the user understands the side-effect.
- Profile: "My incidents" list (timeline). One-tap into a detail view showing the ride + category + note + when it was reported.

### Error codes

| Code                      | HTTP | Meaning                                |
| ------------------------- | ---- | -------------------------------------- |
| `INCIDENT_WINDOW_CLOSED`  | 400  | Ride completed > 24 h ago              |
| `FORBIDDEN` (generic 403) | 403  | Reporter isn't an eligible participant |

### i18n keys

- `incident.report.cta`
- `incident.report.category.harassment`
- `incident.report.category.unsafeDriving`
- `incident.report.category.accident`
- `incident.report.category.other`
- `incident.report.note.label`
- `incident.report.submit`
- `incident.report.submitted.toast`
- `incident.report.submitted.contactNote`
- `incident.my.title`
- `incident.my.empty`
- `error.incidentWindowClosed`

---

## 7. Ratings (US-07, US-08, US-09) — upcoming PR

Backend in flight on `feat/user-ratings`. See `./2026-05-25-user-ratings.md`
for the full spec; the FE-facing surface is summarised below. Treat this
section as **pending merge** — the endpoints below may shift before the PR
lands; this guide will be updated.

### Endpoints

| Method | Path                                 | Auth                          | Notes                                                                         |
| ------ | ------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------- |
| `POST` | `/api/rides/:rideId/ratings`         | session, eligible participant | Body `{ rateeUserId, score, comment? }`. One-shot per `(ride, rater, ratee)`. |
| `GET`  | `/api/me/ratings/summary`            | session                       | `{ averageScore, count }` for the current user (as ratee).                    |
| `GET`  | `/api/users/:userId/ratings/summary` | session                       | Same shape for any user. Used when previewing a counter-party.                |
| `GET`  | `/api/admin/users/:userId/ratings`   | session + admin role          | Paginated full list (includes comments).                                      |

### Eligibility (server-enforced)

- Ride must be `COMPLETED`.
- Rater must be the trip driver, OR a passenger with `boardedAt != null` on that ride.
- Ratee must be the counter-party:
  - rater is driver → ratee must be a boarded passenger of the ride
  - rater is a passenger → ratee must be the trip's driver
- One rating per `(ride, rater, ratee)` — second attempt → `409 RATING_ALREADY_SUBMITTED`.

### Scoring and comment

- `score`: integer 1–5
- `comment`: optional, ≤ 500 characters
- No edit, no delete (v1)

### UX

- **After ride completion**, surface a "Rate your trip" sheet on the ride summary screen:
  - Driver sees one card per boarded passenger (name + avatar + star picker + optional note).
  - Passenger sees one card for the driver.
  - "Skip" is always available; the user can come back later via the completed ride detail.
- **Profile**: aggregate block showing `★ {averageScore.toFixed(1)} ({count})`. Hide entirely if `count === 0`. Tap-through to a "Ratings I've received" view is **out of scope** for v1 (admin sees comments; ordinary users don't).
- **Admin dashboard**: per-user view exposes the full paginated list. Each item is `{ id, rideId, raterId, rateeId, score, comment, createdAt }` — backend does **not** join rater profile or ride details, so the admin UI fetches user/ride info separately by ID if it wants names, avatars, or route info. List envelope is `{ items, page, limit, total }` (mirrors `GET /me/wallet/transactions`).

### Error codes

| Code                       | HTTP | Meaning                                                                                                                                                                  |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RATING_NOT_ELIGIBLE`      | 400  | Rater/ratee pair doesn't match driver↔boarded-passenger, ride isn't completed, or rater wasn't on the ride. `details.reason: 'ride_not_completed' \| 'not_counterparty'` |
| `RATING_ALREADY_SUBMITTED` | 409  | Duplicate `(ride, rater, ratee)`                                                                                                                                         |
| `VALIDATION_FAILED`        | 400  | Standard class-validator envelope — covers score outside 1–5 and comment > 500 chars                                                                                     |

### i18n keys

- `ratings.prompt.title`
- `ratings.prompt.subtitle`
- `ratings.prompt.passenger.label` (e.g. "How was {{name}} as a passenger?")
- `ratings.prompt.driver.label`
- `ratings.prompt.score.aria` (1–5)
- `ratings.prompt.comment.placeholder`
- `ratings.prompt.submit`
- `ratings.prompt.skip`
- `ratings.profile.aggregate.empty`
- `ratings.profile.aggregate.with` (e.g. "{{avg}} stars ({{count}} ratings)")
- `error.ratingNotEligible`
- `error.ratingAlreadySubmitted`
- `error.ratingRangeInvalid`

---

## 8. Background jobs (FE doesn't call; just be aware)

- **Idle-ride sweep** (hourly): auto-completes rides in `IN_PROGRESS` for >6 h with default outcomes. Drivers get a notification.
- **Stranded-active sweep** (hourly): cancels rides scheduled >6 h ago that the driver never started; passengers' holds release automatically.
- **Orphan-hold backstop** (hourly): defence-in-depth; should never fire in normal operation.

Implication for the FE: a passenger may receive a "your ride was cancelled, funds released" push between sessions. Make sure wallet-screen and ride-list refetch on focus reflect the new state.

---

## 9. State machine snapshot

```
Ride:    ACTIVE  ──start──▶  IN_PROGRESS  ──complete──▶  COMPLETED
         │                    │
         └─cancel─▶ CANCELLED  └─cron(6h)─▶ COMPLETED (idle sweep)

Booking: PENDING / ACCEPTED  ──any cancel/reject/expire──▶  CANCELLED / REJECTED / EXPIRED
         (every path funnels through markBookingResolved → releaseHold)
```

Source of truth: `docs/state-machines.md` in the backend repo.

---

## 10. Suggested FE PR order (each independently shippable)

1. **Trusted contact** (smallest blast radius; unblocks tests for the rest).
2. **Wallet held + INSUFFICIENT_WALLET_BALANCE handling + pricePerSeatCents on trip create**.
3. **Ride lifecycle** (start endpoint + complete-with-overrides).
4. **Boarding QR + scanner**.
5. **Incidents**.
6. **Ratings** (depends on a completed ride existing in the system, so usually last).

Backend gates each one; you can land them in any order, but the suggested order minimises mock data needed in earlier PRs.

---

## 11. Open questions for the FE

- Boarding token poll cadence — backend rotates every ~30 s with 1 slot of skew; suggested poll every 25 s. Confirm this works on Expo Go.
- Top-up deep-link from the booking shortfall — does the wallet screen already accept an `amount` query param? If not, that's a small wallet-screen addition.
- Push notifications on idle-sweep auto-completion — FE side; coordinate with the notifications module owner.
