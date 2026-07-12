# Architecture

## Folders

`src/` has four parents, each with a path alias.

| Folder          | Contents                                                                                                            | Alias             |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `core/`         | Framework-level infra every module depends on (`config`, `database`)                                                | `@core/*`         |
| `integrations/` | Wrappers around external services (`mail`, `routing`, `traffic`, `stripe`)                                          | `@integrations/*` |
| `modules/`      | Domain feature modules (`auth`, `trips`, `fleet`, `leaderboard`, `notifications`, `wallet`, `safety`, `ratings`, …) | `@modules/*`      |
| `shared/`       | Cross-cutting building blocks reused across modules                                                                 | `@shared/*`       |

Use the alias for cross-module imports; intra-module imports stay relative.

## Layers

| Layer      | Responsibility                                                                                                            | Location                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Controller | HTTP routing, calls service. No business logic.                                                                           | `<module>/<resource>/<resource>.controller.ts` |
| DTO        | Request/response shape; `class-validator` is the input contract.                                                          | `<module>/<resource>/dto/`                     |
| Service    | Owns the use case. Opens transactions, composes repositories, throws NestJS exceptions.                                   | `<module>/<resource>/<resource>.service.ts`    |
| Repository | Per-table data access. `tx` first arg, returns rows / `null`. No exceptions, no business rules, no multi-table mutations. | `<module>/<resource>/<resource>.repository.ts` |
| Domain     | Pure logic — no I/O, no DI.                                                                                               | `<module>/domain/`                             |
| Mapper     | DB row → response DTO. Outbound only.                                                                                     | `<module>/<resource>/<resource>.mapper.ts`     |
| Schema     | Drizzle table definitions; source of truth for types.                                                                     | `core/database/schema/`                        |

No entity layer. Drizzle's `$inferSelect` / `$inferInsert` IS the entity.

```
HTTP → Controller → DTO (validated) → Service → Repository (tx) → DB
                       ↳ Service → Domain (pure)         ↘ Mapper → Response DTO → HTTP
```

## Where new code goes

Start narrow, graduate when a second consumer arrives.

| Scope                      | Location                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| One resource               | `<module>/<resource>/`                                                                           |
| Pure logic, one module     | `<module>/domain/`                                                                               |
| Multi-resource, one module | `<module>/<module>.types.ts` for shared types; cross-resource verbs compose at the service layer |
| Multi-module               | `src/shared/`                                                                                    |

## Conventions

- **Repositories** are status-agnostic primitives. No exceptions, no business-rule predicates in `WHERE`, no multi-table mutations. Idempotent safety guards (`WHERE status='active'`) are OK when load-bearing for race safety.
- **Services** translate `null` → NestJS exceptions and own all business rules.
- **Mappers** are unidirectional (DB → DTO). The reverse direction is inline in the service. Promote to `<module>/mappers/` once 3+ accumulate.
- **Module types** (`<module>/<module>.types.ts`) are the single source of truth for status tuples, value objects, and shared domain inputs. DTOs and services derive from them — they don't redeclare. Graduate to `src/shared/` once a second module needs the same type.
- **Business rules** live in services with user-facing exceptions. FKs and partial-unique indices are a safety net only — never enforce business rules with DB triggers.
- **Drizzle migrations are immutable.** Once merged into `develop`, never edit in place; add a new migration on top.

## Background jobs

Three `@Cron`-driven sweeps run inside the API process. Each handler processes one row per `db.transaction(...)` and swallows per-row errors so a single bad row never aborts the pass.

| Service                                             | Schedule       | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `modules/trips/bookings/bookings-expiry.service.ts` | `*/15 * * * *` | `PENDING` bookings on past rides → `EXPIRED` via `BookingsService.markBookingResolved` (so the seam runs and any incidental hold is released).                                                                                                                                                                                                                                                                                                               |
| `modules/trips/rides/traffic-watcher.service.ts`    | every minute   | Pre-departure traffic delay watcher; fans out `traffic_alert` push notifications.                                                                                                                                                                                                                                                                                                                                                                            |
| `modules/trips/rides/rides-sweep.service.ts`        | `1 * * * *`    | Three queries: (1) idle in-progress rides (`started_at` more than 6 h ago) → `RidesService.settleAndComplete(tx, id, [])`; (2) stranded active rides (`scheduled_departure` more than 6 h ago AND `started_at IS NULL`) → `RidesService.expireUnstarted`; (3) orphan-hold backstop — `wallet_holds.status='active'` joined to a terminal booking releases the hold and logs `logger.error` (a hit means a missed cancellation seam upstream, not a cleanup). |

The rides-sweep schedule offsets to minute 1 so it doesn't fight the booking-expiry sweep for a connection at the top of the hour.

## Module-specific notes

- **`modules/safety/`** owns trusted-contact CRUD + the `assertHasContact` gate AND the US-06 incident-reporting surface (`POST /rides/:id/incidents`, `GET /me/incidents`). The module never imports `TripsModule`; the dependency direction is `TripsModule → SafetyModule`. `IncidentsRepository` joins across `rides`, `trips`, `user`, and `cars` directly — an intentional exception to the "repositories are status-agnostic primitives" rule, documented at the call site and in `docs/plans/2026-05-21-safety-and-payments.md`. The join is read-only (assembling the email payload), no cross-table mutations.
- **`modules/ratings/`** owns the post-ride rating surface (US-07/08/09): `POST /rides/:id/ratings`, `GET /me/ratings/summary`, `GET /users/:id/ratings/summary`, and the admin `GET /admin/users/:id/ratings`. The module never imports `TripsModule`; eligibility resolves through a cross-table read-only join in `RatingsRepository` (`rides` + `trips` + `bookings`) — same convention exception as `IncidentsRepository`, documented at the call site and in `docs/plans/2026-05-25-user-ratings.md`. Aggregates (`averageScore`, `count`) are computed on read against the `(ratee_id, created_at desc)` index; there is no denormalised counter on `user`.

## DRY — single source of truth

The same shape, enum, or rule existing in two files that drift apart is the most common maintenance trap here. Before adding a type, constant, or helper, search for an existing one and reuse or extend it. If you must redeclare (e.g., a DTO that intentionally diverges from a DB type), name the canonical source in a one-line comment.

## Comments

Default to none. Add one only when _why_ is non-obvious — a hidden constraint, a workaround, an invariant a reader could plausibly violate. Don't comment what well-named code already says.
