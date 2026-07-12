# Safety and Payments

**Date:** 2026-05-21
**Status:** planned
**Epic:** Safety and payments (6 user stories, ≈47 pts) — see `../../../safety-and-payments.md`

> **Scope override (2026-05-24):** US-01 and US-02 (Phase 1 + Phase 2) ship
> as a single backend PR and a single frontend PR rather than two PR pairs.
> Rationale: both stories share the same external surface (Stripe), so
> landing all Stripe plumbing — Checkout, Connect, raw-body, both webhook
> routes — in one reviewable unit beats splitting them.
>
> **Scope override (2026-05-25):** P3–P6 collapse into a single
> backend-only PR; the matching frontend work ships in a later cycle.
> Rationale: with Stripe plumbing already live, the remaining stories
> (trusted contact, ride lifecycle, boarding + holds, incidents) are all
> internal/backend changes that compose around `BookingsService` and
> `RidesService`. Landing them together means we wire holds live from
> day one (no P4 stub layer) and run the seam refactor
> (`markBookingResolved`) once instead of twice. The P5 caution about
> "extra review" applies to the seam itself, not the bundling.

## Goal

Add a wallet-backed payment system (Stripe, test mode end-to-end) and two
safety features (trusted contact, incident reporting) to cogo-backend.
Passengers prepay seat fares from a wallet; the fare is held on accept,
captured on boarding, settled on ride completion; drivers withdraw earnings
through Stripe Connect. Keep it small and demoable.

## Decisions (locked)

| Question                      | Answer                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Seat fare source              | Driver-set per trip. `trips.price_per_seat_cents` (int not null). `bookings.fare_cents` copies it on accept and freezes. Single-step migration: `ADD COLUMN … INT NOT NULL DEFAULT 0` (Postgres 11+ adds the column without rewriting rows). Test rows land at 0; harmless because drivers set a real price on the next edit.                                                                                                 |
| Money                         | Integer cents, EUR. No floats.                                                                                                                                                                                                                                                                                                                                                                                                |
| Wallet creation               | Lazy. `getOrCreateWallet` with `INSERT … ON CONFLICT DO NOTHING`.                                                                                                                                                                                                                                                                                                                                                             |
| Boarding QR                   | Stateless HMAC token (`bookingId                                                                                                                                                                                                                                                                                                                                                                                              | window`, ~30s TTL, rotates per window). Reuse blocked by `bookings.boarded_at`. |
| Ledger ownership              | One `WalletService`, sole writer of `balance_cents` / `held_cents`. All primitives take `tx: DbClient` first.                                                                                                                                                                                                                                                                                                                 |
| Settlement timing             | Capture/release in-transaction (boarding scan, ride completion). CO2 crediting stays on the post-commit `ride.completed` event.                                                                                                                                                                                                                                                                                               |
| Price guardrails              | None. Any non-negative `pricePerSeatCents`.                                                                                                                                                                                                                                                                                                                                                                                   |
| Platform fee                  | None. Driver receives 100 % of the fare. The fee was cosmetic for a uni-project demo; introducing it without a real recipient added one env var, one ledger row type, and a "where does this row live" question with no functional payoff. A future real-money version would add it as a single env var + one line of fare math.                                                                                              |
| Withdrawal minimum            | None. Available balance is the only bound.                                                                                                                                                                                                                                                                                                                                                                                    |
| Idle-ride auto-completion     | Hourly sweep; completes rides where `started_at < now() - interval '6 hours'` with default outcomes, notifies the driver.                                                                                                                                                                                                                                                                                                     |
| Incident reporter eligibility | Boarded passengers (`boarded_at IS NOT NULL`); trip driver always eligible.                                                                                                                                                                                                                                                                                                                                                   |
| Driver reports on carpools    | Email lists every accepted passenger (name + phone). No per-passenger picker.                                                                                                                                                                                                                                                                                                                                                 |
| Stripe Connect region         | Spain only.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Fare visibility               | `pricePerSeatCents` returned by trip search, trip detail, ride detail/search.                                                                                                                                                                                                                                                                                                                                                 |
| Manual boarding fallback      | None. Use the post-completion "boarded anyway" override.                                                                                                                                                                                                                                                                                                                                                                      |
| Incident email "other party"  | Passenger reports → driver + car (make/model/plate). Driver reports → all accepted passengers (name + phone).                                                                                                                                                                                                                                                                                                                 |
| Withdrawal completion         | Three-step, two transactions: tx1 `reserveWithdrawal`; commit. Then `stripe.transfers.create({ idempotencyKey: withdrawal.id })` with no DB tx held open. Then tx2: on success `settleWithdrawal`, on Stripe 4xx `reverseWithdrawal`. Network errors leave the row `pending` for the Connect webhook (`transfer.created` / `payout.failed`) to reconcile — the idempotency key prevents Stripe-side duplication on any retry. |

---

## Cross-cutting foundations

### Stripe integration

New `src/integrations/stripe/` (mirrors `mail`, `routing`, `traffic`): a
`StripeModule` exporting a thin `StripeService` wrapping Checkout sessions,
`constructEvent`, Connect account + account link, transfers. Add `stripe` to
`package.json`.

### Env vars (`env.validation.ts` + `.env.example`)

| Var                                                              | Notes                           |
| ---------------------------------------------------------------- | ------------------------------- |
| `STRIPE_SECRET_KEY`                                              | required                        |
| `STRIPE_WEBHOOK_SECRET`                                          | payments webhook signing secret |
| `STRIPE_CONNECT_WEBHOOK_SECRET`                                  | Connect webhook signing secret  |
| `WALLET_RETURN_URL`, `CONNECT_RETURN_URL`, `CONNECT_REFRESH_URL` | Expo deep links                 |
| `BOARDING_TOKEN_SECRET`                                          | HMAC secret for QR tokens       |

Top-up limits (1 €–500 €) are code constants.

### Webhook raw body

`main.ts` runs with `bodyParser: false` and better-auth re-applies JSON
parsing. Stripe signature verification needs raw bytes. Mount
`express.raw({ type: '*/*' })` on `/api/webhooks/stripe*` in `main.ts` before
Nest's parser. Webhook routes use `@AllowAnonymous()`.

### New modules

- `src/modules/wallet/` — wallet, ledger, top-ups, withdrawals, payout account, webhooks.
- `src/modules/safety/` — trusted contact, incidents.

`TripsModule` imports both. Neither imports `TripsModule` (the incidents
repository joins shared schema tables directly — no cycle).

### New error codes (`shared/errors/error-codes.ts`)

`TOPUP_AMOUNT_OUT_OF_RANGE`, `INSUFFICIENT_WALLET_BALANCE`,
`PAYOUT_ACCOUNT_NOT_READY`, `BOARDING_TOKEN_INVALID`,
`BOARDING_ALREADY_RECORDED`, `RIDE_NOT_IN_PROGRESS`, `RIDE_ALREADY_STARTED`,
`TRUSTED_CONTACT_REQUIRED`, `INCIDENT_WINDOW_CLOSED`.

`INSUFFICIENT_WALLET_BALANCE` is also added to `BOOKING_SKIP_REASONS` (it
surfaces per-item from the accept batch when a passenger loses a funds race).

---

## Data model

### New tables

**`wallets`** — PK `user_id` → user.id.

| Column                      | Type                   | Notes                                  |
| --------------------------- | ---------------------- | -------------------------------------- |
| `user_id`                   | text pk                |                                        |
| `balance_cents`             | int not null default 0 | total credit (includes held)           |
| `held_cents`                | int not null default 0 | reserved against active holds          |
| `stripe_connect_account_id` | text null              |                                        |
| `payout_status`             | text default `'none'`  | `none`/`pending`/`active`/`restricted` |
| `created_at`, `updated_at`  | timestamp              |                                        |

Available = `balance_cents − held_cents` (denormalised counters, same pattern as `rides.seats_occupied`).

**`wallet_transactions`** — append-only ledger of realized money movements.

| Column                     | Type                   | Notes                                    |
| -------------------------- | ---------------------- | ---------------------------------------- |
| `id`                       | text pk                |                                          |
| `wallet_id`                | text → wallets.user_id |                                          |
| `type`                     | text                   | `topup`/`withdrawal`/`payment`/`earning` |
| `status`                   | text                   | `pending`/`completed`/`failed`           |
| `amount_cents`             | int                    | signed (+ credit, − debit)               |
| `booking_id`               | text null              |                                          |
| `ride_id`                  | text null              |                                          |
| `stripe_ref`               | text null              | Checkout session / transfer id           |
| `description`              | text null              |                                          |
| `created_at`, `updated_at` | timestamp              |                                          |

Indexes: `(wallet_id, created_at desc)` for history; partial unique on
`stripe_ref` (where not null) for webhook idempotency.

Holds live in their own table (below); `wallet_transactions` records only
movements that have actually settled. A passenger no-show writes a `payment`
row (and a `earning` row to the driver) just like a normal boarding —
whether it was a no-show is derivable from `bookings.boarded_at`.

**`wallet_holds`** — active reservations against `held_cents`.

| Column                     | Type                   | Notes                                                                |
| -------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `id`                       | text pk                |                                                                      |
| `wallet_id`                | text → wallets.user_id | passenger's wallet                                                   |
| `booking_id`               | text → bookings.id     | partial-unique where `status = 'active'` (one open hold per booking) |
| `amount_cents`             | int                    | always positive                                                      |
| `status`                   | text                   | `active`/`released`/`captured` (`active` → `released` or `captured`) |
| `created_at`, `updated_at` | timestamp              |                                                                      |

**`trusted_contacts`** — PK `user_id`; `name`, `email`, `created_at`, `updated_at`. One per user.

**`safety_incidents`** — `id` pk, `ride_id` → rides.id, `reporter_id` → user.id, `category` (`harassment`/`unsafe_driving`/`accident`/`other`), `note` text null, `created_at`. Index `(reporter_id, created_at desc)`.

### Column additions

- `trips`: `price_per_seat_cents` int not null. `CreateTripDto`/`UpdateTripDto` gain `pricePerSeatCents`.
- `bookings`: `fare_cents` int null (copied on accept), `boarded_at` timestamp null. `boarded_at` is the authoritative boarding signal — `booking.status` does **not** change at boarding. Code reading "did this passenger board?" checks `boarded_at IS NOT NULL`.
- `rides`: `started_at` timestamp null, `flagged_for_review` boolean default false.

### Type tuples

- `trips.types.ts`: `RIDE_STATUSES` gains `'in_progress'`.
- `wallet/wallet.types.ts`: `WALLET_TRANSACTION_TYPES`, `WALLET_TRANSACTION_STATUSES`, `WALLET_HOLD_STATUSES`, `PAYOUT_STATUSES`.
- `safety/safety.types.ts`: `INCIDENT_CATEGORIES`.

Rows typed via `$inferSelect`/`$inferInsert`; status columns use `.$type<…>()`.

---

## Ledger model

`WalletService` is the single writer of `balance_cents` / `held_cents` and
the only code that mutates `wallet_holds` / `wallet_transactions`. Every
primitive locks the affected wallet row(s) `FOR UPDATE` and takes a `tx`:

| Primitive                       | wallet effect                                                           | hold effect                    | ledger row(s) inserted                                                                |
| ------------------------------- | ----------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| `placeHold(passenger, booking)` | passenger.`held += fare`                                                | insert `wallet_holds` `active` | —                                                                                     |
| `releaseHold(booking)`          | passenger.`held −= fare`                                                | hold → `released`              | —                                                                                     |
| `captureHold(booking)`          | passenger: `balance −= fare`, `held −= fare`; driver: `balance += fare` | hold → `captured`              | `payment` (passenger, `−fare`, `completed`); `earning` (driver, `+fare`, `completed`) |
| `creditTopup(tx-row)`           | `balance += amount`                                                     | —                              | topup `pending → completed`                                                           |
| `reserveWithdrawal(amount)`     | `balance −= amount`                                                     | —                              | insert withdrawal `pending`                                                           |
| `settleWithdrawal(tx-row)`      | —                                                                       | —                              | withdrawal `pending → completed`                                                      |
| `reverseWithdrawal(tx-row)`     | `balance += amount`                                                     | —                              | withdrawal `pending → failed`                                                         |

A booking's hold is resolved exactly once (partial-unique on
`wallet_holds.booking_id` where `status = 'active'`). Capture from a hold
cannot fail for insufficient funds — the funds were reserved at accept.

Webhook handlers and `settle/reverseWithdrawal` are idempotent: every state
flip is guarded (`WHERE status = 'pending'`), so duplicate Stripe deliveries
and post-hoc reconciliation are no-ops.

---

## API surface

User routes are cookie-authed (`@ApiCookieAuth`, `@Session()`); webhooks are
`@AllowAnonymous()` + signature-verified. `/api` is the global prefix.

| Story | Method & path                                | Purpose                                               |
| ----- | -------------------------------------------- | ----------------------------------------------------- |
| US-01 | `GET /me/wallet`                             | balance, held, available, recent transactions         |
| US-01 | `GET /me/wallet/transactions`                | paginated history                                     |
| US-01 | `POST /me/wallet/top-ups`                    | `{ amountCents }` → `{ checkoutUrl, transactionId }`  |
| US-01 | `POST /webhooks/stripe`                      | Checkout completion / payment failure                 |
| US-02 | `POST /me/wallet/payout-account`             | start Connect onboarding → `{ onboardingUrl }`        |
| US-02 | `GET /me/wallet/payout-account`              | `{ status }`                                          |
| US-02 | `POST /me/wallet/withdrawals`                | `{ amountCents }`                                     |
| US-02 | `POST /webhooks/stripe/connect`              | `account.updated`, `payout.failed`                    |
| US-03 | `GET /me/bookings/:bookingId/boarding-token` | rotating QR token                                     |
| US-03 | `POST /boarding-scans`                       | `{ token }` → resolve booking → mark boarded, capture |
| US-04 | `POST /rides/:rideId/start`                  | driver starts ride                                    |
| US-04 | `POST /rides/:rideId/complete`               | extended with per-passenger overrides                 |
| US-05 | `GET /me/trusted-contact`                    | current contact                                       |
| US-05 | `PUT /me/trusted-contact`                    | set/replace; never clears                             |
| US-06 | `POST /rides/:rideId/incidents`              | `{ category, note? }`                                 |
| US-06 | `GET /me/incidents`                          | incidents I reported                                  |

`POST /trips/:tripId/bookings` gains `INSUFFICIENT_WALLET_BALANCE` (with
`shortfallCents`) and `TRUSTED_CONTACT_REQUIRED`; `POST /trips` gains the
same `TRUSTED_CONTACT_REQUIRED` precondition.

---

## Module layout

```
src/modules/wallet/
  wallet.module.ts
  wallet.types.ts
  wallet.controller.ts          all /me/wallet/* routes
  wallet.service.ts             ledger primitives + top-up/withdrawal/payout-account orchestration
  wallet.repository.ts          wallets + wallet_transactions
  wallet.mapper.ts
  webhook.controller.ts         POST /webhooks/stripe[/connect]
  dto/

src/modules/safety/
  safety.module.ts
  safety.types.ts
  trusted-contact.controller.ts GET/PUT /me/trusted-contact
  trusted-contact.service.ts    exports assertHasContact(tx, userId)
  trusted-contact.repository.ts
  incidents.controller.ts       POST /rides/:id/incidents, GET /me/incidents
  incidents.service.ts          inserts, flags ride, calls MailService post-commit
  incidents.repository.ts       joins ride/trip/user/car directly (read-only)
  incidents.mapper.ts
  dto/
```

One service per module, mirroring `modules/trips/bookings/`. Top-up,
withdrawal, and payout-account flows are methods on `WalletService`; the
webhook controller routes signature-verified events back into the same
service.

`incidents.repository.ts` reading across `rides`, `trips`, `user`, and
`car` is an intentional convention exception to "repositories are
status-agnostic primitives" — the join is read-only (assembling the email
payload), no cross-table mutations, and pulling it into TripsModule would
create a cycle. Documented here so a future reader doesn't try to
"correct" it.

Boarding (US-03) and ride start/complete (US-04) live in the existing
`modules/trips/{bookings,rides}` — no new module.

---

## Per-story notes

Read alongside the API surface, data model, and ledger sections above; those
already describe the shape. The points below cover only the non-obvious
mechanics.

### US-01 — Manage my wallet

Top-up creates a `pending` row, returns a Stripe Checkout URL. The webhook
maps `checkout.session.completed` → `creditTopup`, and
`payment_intent.payment_failed` → tx `failed`. Idempotent by `stripe_ref`.

Pathological ordering accepted: if `payment_intent.payment_failed` arrives
before `checkout.session.completed` for the same session (rare; only via
out-of-order delivery), the guard locks the row at `failed` and the later
`completed` is silently dropped. The user sees the top-up as failed and can
retry. Not worth modelling around for a uni-project test-mode flow.

### US-02 — Get paid for the rides I drive

Onboarding creates a Spain Connect Express account + account link.
`GET /me/wallet/payout-account` returns just `{ status }`; the frontend
renders a generic "complete onboarding to enable withdrawals" when not
`active` — AC requires "what is still missing" which is satisfied at that
granularity. Withdrawal is three steps across two transactions, never
holding a DB tx across the Stripe HTTP call:

1. Tx 1: `reserveWithdrawal(amount)` — inserts a `withdrawal` row `pending`
   and decrements `balance_cents`. Commit.
2. `stripe.transfers.create({ idempotencyKey: withdrawal.id })`. No tx open.
3. Tx 2: on Stripe success, `settleWithdrawal` flips `pending → completed`.
   On Stripe 4xx, `reverseWithdrawal` flips `pending → failed` and credits
   the balance back. On a network/unknown error, leave `pending` and let
   the Connect webhook reconcile.

This avoids the "Stripe succeeded, DB COMMIT failed" double-payout window
inherent to wrapping the HTTP call in a DB transaction, frees the pool
connection during the round-trip, and lets the idempotency key make any
retry safe Stripe-side. The webhook updates `payout_status` from
`account.updated`; `payout.failed` calls `reverseWithdrawal`.

### US-03 — Pay for a seat at boarding

- `BookingsService.createBatch` checks available balance ≥ trip price; rich `INSUFFICIENT_WALLET_BALANCE` with `shortfallCents`.
- `BookingsService.accept` copies `price_per_seat_cents` → `bookings.fare_cents` and calls `WalletService.placeHold` in the same tx. A funds race skips the item via `BOOKING_SKIP_REASONS`.
- A new `BookingsService.markBookingResolved(tx, bookingId, finalStatus)` is the single seam through which an `accepted` booking moves to any non-terminal final state (`cancelled` / `rejected` / `expired`): it flips the booking status and calls `releaseHold` for it. Every existing path that resolves a booking funnels through this method — `cancelOne`, `cancelMineOnTrip`, **the cancel and reject cascades inside `RidesService.cancel` and `TripsService.cancel`** (today these call `bookingsRepo.rejectActiveInRides`, which moves bookings to `rejected` _without_ releasing holds — the new seam fixes that), and the booking-expiry sweep. New future resolution paths get hold release for free; no scattered call-site drift, and the orphan-hold cron query (see `## Cron jobs`) is a defence-in-depth backstop, not a routine cleanup.
- Boarding token: pure `bookings/domain/boarding-token.ts` (HMAC sign/verify with skew). `GET /me/bookings/:id/boarding-token` (passenger-only, booking `accepted`, ride `in_progress`).
- `POST /boarding-scans` (driver-only): decode the token, resolve `booking_id` → ride, verify the ride is `in_progress` and driven by the caller, booking not already boarded; `captureHold`; set `boarded_at`. Flat path (no `:rideId`) — the token already pins the booking, and the booking pins the ride. One less param to thread through the FE scanner.

### US-04 — Run a ride from start to completion

- `POST /rides/:rideId/start` (driver-only): window −30 min … +2 h around `scheduled_departure`; `active → in_progress`.
- Existing-code guards for `in_progress`: `RidesService.complete` requires `active|in_progress`; `RidesService.cancel` requires `active` (else `RIDE_ALREADY_STARTED`); `BookingsService.cancelOne`/`cancelMineOnTrip` refuse once ride is `in_progress|completed`.
- `POST /rides/:rideId/complete`: `CompleteRideDto` drops `seatsOccupied` and gains `unscannedOutcomes?: { bookingId, outcome: 'refund' | 'boarded' }[]`. For each accepted booking: scanned → already captured, skip; unscanned → apply override or default (started at/after scheduled departure → `captureHold` (same primitive as a normal boarding — the no-show vs normal distinction is derivable from `boarded_at`); before → `releaseHold`). `seatsOccupied` (for CO2 freeze) = count of finally-boarded passengers. Extract a shared internal `RidesService.settleAndComplete(tx, rideId, overrides)` for reuse by the cron.

### US-05 — Set my trusted safety contact

`PUT /me/trusted-contact` upserts; the DTO requires non-empty `name` + valid
`email` and never clears. `TrustedContactService.assertHasContact(tx, userId)`
is called at the start of `BookingsService.createBatch` and trip publish;
throws `TRUSTED_CONTACT_REQUIRED` (403). Enforced on every request — simpler
than tracking "first time" and indistinguishable to the user.

### US-06 — Report a safety incident

`POST /rides/:rideId/incidents`: reporter must be the trip driver, or a
passenger whose booking has `boarded_at IS NOT NULL` on that ride. Ride must
be `in_progress` or completed ≤ 24 h ago (`INCIDENT_WINDOW_CLOSED`). Insert
the incident, set `flagged_for_review`. Post-commit, the service calls
`MailService.sendIncidentAlertEmail` (new method, en/es/ca templates) with
the reporter's trusted contact and the other-party block: passenger reporter
→ driver + car (make/model/plate); driver reporter → list of accepted
passengers (name + phone). `GET /me/incidents` lists mine, newest first.

---

## Cron jobs

One new cron covers all post-departure ride lifecycle and hold-leak
detection. `rides/rides-sweep.service.ts`, modelled on
`BookingsExpiryService`. Hourly (`'0 * * * *'`). Three queries per pass,
each row processed in its own `db.transaction`; errors swallowed per row,
counts logged.

1. **Idle in-progress rides.** `status='in_progress' AND started_at < now() - interval '6 hours'` → `RidesService.settleAndComplete(tx, id, [])`. Push a summary notification to the driver (`N charged, M refunded`) via the existing `notifications` module.
2. **Stranded active rides (driver never started).** `status='active' AND scheduled_departure < now() - interval '6 hours' AND started_at IS NULL` → `RidesService.expireUnstarted(tx, id)`: flips ride to `cancelled` (reason `'driver_no_show'`), funnels each `accepted` booking through `BookingsService.markBookingResolved` (releases the hold), expires `pending` bookings, archives the trip if no future actives remain. Closes the gap where holds would otherwise sit indefinitely on rides the driver no-showed.
3. **Orphan-hold backstop.** `wallet_holds.status='active'` joined to a booking in a terminal state (`cancelled`/`rejected`/`expired`) → `WalletService.releaseHold(tx, bookingId)` and `logger.error(...)`. A hit indicates a missed cancellation seam upstream — surface it as a bug, do not silently auto-heal.

The 6 h threshold is symmetric with the idle-in-progress threshold and
generous enough to absorb late-departure UX without stranding holds.

No other crons. Top-up and withdrawal state are driven by Stripe webhooks;
adding a reconciliation cron could mis-classify in-flight payments and ship
a UI lie, so a stuck `pending` top-up is accepted as cosmetic. The
stateless boarding token needs no cleanup. The existing
`BookingsExpiryService` and `TrafficWatcherService` keep their current
scope unchanged.

---

## Tests

Domain unit specs colocated as `*.spec.ts`; one e2e per story in `test/`
using the existing `helpers/{factories,db,auth}.ts`. Webhook tests construct
a signed payload with the test signing secret rather than calling Stripe.
`pnpm lint && pnpm test` green before each story is done.

Update `rides.e2e-spec.ts` and any `CompleteRideDto` specs — the
complete-ride contract changed (US-04).

---

## Docs to update

- `docs/db-diagram.md` — new tables and columns.
- `docs/state-machines.md` — `in_progress` ride state; complete-ride settlement.
- `docs/conceptual-diagram.md` — wallet / incident concepts.
- `docs/architecture.md` — add `wallet` and `safety` to the module list.

Swagger is generated from decorators. `schema.dbml` is generated and gitignored.

## Out of scope

- Real-money / Stripe live mode.
- Admin review UI for flagged rides — US-06 only sets the flag.
- Refunds, disputes, and chargebacks (the only money movements modelled are top-up, withdrawal, payment, and earning).
- Multi-currency, partial captures, wallet-to-wallet transfers.
- A webhook-reconciliation safety-net cron — webhooks are authoritative.
- Account deletion with a non-zero wallet balance or active holds.
- Connect account state changes (e.g. `active → restricted`) while a withdrawal is `pending` — the transfer either completes or fails, and both branches are handled by the normal withdrawal flow.

## Phases

Six phases. Each = one backend PR + one frontend PR, both green and
demoable before the next phase starts. The goal is to avoid a giant
backend PR landing only to discover the frontend integration broke a flow.

**Stripe touchpoints (P1 and P2) come first** so all external-service
plumbing — Checkout, Connect, two webhooks, raw-body handling — is wired,
tested, and de-risked before any of the ride/booking work begins. The
remaining phases (P3–P6) have no external dependencies.

### Phase 1 — Wallet & top-ups (US-01) [Stripe Checkout]

- **Backend:** `wallets`, `wallet_transactions` tables; `WalletService` top-up primitives (`creditTopup`, mark-failed); lazy `getOrCreateWallet`; `StripeService` (Checkout, `constructEvent`); raw-body mount on `/api/webhooks/stripe*`; `GET /me/wallet`, `GET /me/wallet/transactions`, `POST /me/wallet/top-ups`, `POST /webhooks/stripe`.
- **Frontend:** wallet screen (balance, available, held=0 in this phase); top-up flow (amount picker → Stripe Checkout web-view → return); transactions list.
- **Demo:** top up €20 with `4242 4242 4242 4242`, balance updates, transaction shows `completed`; a declined card (`4000 0000 0000 0002`) appears as `failed` and balance is unchanged.

### Phase 2 — Withdrawals (US-02) [Stripe Connect]

- **Backend:** `wallets.stripe_connect_account_id` + `payout_status` columns; Connect Express account/account-link creation; `POST /me/wallet/payout-account`, `GET /me/wallet/payout-account`, `POST /me/wallet/withdrawals` (three-step pattern: reserve-commit → Stripe with idempotency key → settle-or-reverse commit); second webhook route `POST /webhooks/stripe/connect` for `account.updated` and `payout.failed`. `WalletService` withdrawal primitives (`reserveWithdrawal`/`settleWithdrawal`/`reverseWithdrawal`) become live.
- **Frontend:** payout-account section in wallet screen (status + onboarding entry-point); withdrawal screen; "complete onboarding to enable withdrawals" callout when status ≠ `active`.
- **Demo:** top up €5 (from P1), complete Connect onboarding with Stripe test data, withdraw €5, transfer appears in the Stripe dashboard. A forced-fail onboarding/payout is shown in the UI. End-to-end Stripe round-trip without depending on rides or bookings.

### Phase 3 — Trusted contact gate (US-05)

- **Backend:** `trusted_contacts` table; `TrustedContactService.assertHasContact(tx, userId)`; `GET /me/trusted-contact`, `PUT /me/trusted-contact`; precondition wired into `BookingsService.createBatch` and trip-publish (throws `TRUSTED_CONTACT_REQUIRED`).
- **Frontend:** trusted-contact section in profile (name + email); inline prompt on first booking attempt and first trip publish.
- **Demo:** book/publish fails with the precondition; set a contact; book/publish succeeds.

### Phase 4 — Ride lifecycle (US-04, state-machine only)

- **Backend:** `rides.started_at` column; `'in_progress'` added to `RIDE_STATUSES`; `POST /rides/:rideId/start` (window validation); updated `POST /rides/:rideId/complete` with `unscannedOutcomes` — override logic and no-show defaults exist, but the underlying payment effects are stubbed/no-op in this phase; idle-ride sweep cron runs with no-op payment effects; existing-code guards (`RidesService.cancel` rejects `in_progress`; passenger/driver cancellations refused once in-progress).
- **Frontend:** start-ride button on the driver's active ride; updated complete-ride screen showing scanned/unscanned and per-passenger override controls.
- **Demo:** driver starts a ride within the start window; cannot cancel after starting; completes with overrides; idle sweep auto-completes a stalled ride after the threshold.

### Phase 5 — Boarding & holds (US-03) — riskiest; request extra review

- **Backend:** `wallet_holds` table; `bookings.fare_cents` and `bookings.boarded_at` columns; hold primitives (`placeHold`/`releaseHold`/`captureHold`) become live; `BookingsService.markBookingResolved(tx, bookingId, finalStatus)` introduced as the single seam through which an accepted booking moves to a terminal state (`cancelled` / `rejected` / `expired`), and every existing resolution path funneled through it — `cancelOne`, `cancelMineOnTrip`, **the cancel and reject cascades inside `RidesService.cancel` and `TripsService.cancel`** (today these call `bookingsRepo.rejectActiveInRides` and would otherwise leave holds stranded), and the booking-expiry sweep; `placeHold` wired into `BookingsService.accept`; `captureHold`/`releaseHold` wired into ride-complete settlement and the idle sweep (was no-op in P4); boarding-token domain (HMAC sign/verify); `GET /me/bookings/:id/boarding-token`; `POST /boarding-scans`. `INSUFFICIENT_WALLET_BALANCE` added to `BOOKING_SKIP_REASONS`. The cron's new stranded-active-rides query and orphan-hold backstop (see `## Cron jobs`) also become active here.
- **Frontend:** passenger sees fare on booking request and on accepted bookings; boarding-token QR screen on accepted booking once the ride is in-progress; driver QR scanner on the started ride.
- **Demo:** book a seat → fare reserved (hold visible); cancel → released; book again, get accepted, driver starts ride, scan QR at boarding → captured (passenger debit + driver earning rows); complete ride; full passenger journey works end-to-end.

### Phase 6 — Incidents (US-06)

- **Backend:** `safety_incidents` table; `rides.flagged_for_review` column; `POST /rides/:rideId/incidents` (eligibility + 24 h window guards); `GET /me/incidents`; `MailService.sendIncidentAlertEmail` (en/es/ca templates) called post-commit with the appropriate other-party block.
- **Frontend:** incident-report sheet on in-progress and recently-completed rides (category picker + optional note); "My incidents" list in profile.
- **Demo:** report incident as boarded passenger → trusted contact gets email with ride + driver/car block; report as driver → email lists accepted passengers; ride row shows `flagged_for_review`.

### Parallelism and sequencing notes

- P1 → P2 is a hard sequence (P2 builds on P1's wallet, `WalletService` skeleton, and webhook plumbing).
- P3 and P6 are independent of payments and could be parallelised with each other or with P2 if capacity allows.
- P4 → P5 is a hard sequence (P5 turns P4's stubbed payment effects on).
- P5 is the only phase that mutates existing booking-accept and cancellation code paths; review it more carefully and keep the PR tightly scoped.
- Each phase's backend PR includes its migrations, tests, and Swagger updates as one unit; the matching frontend PR ships against the same release.
