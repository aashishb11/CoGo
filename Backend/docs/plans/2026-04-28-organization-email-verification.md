# Plan: Organization Email Verification & Org Surfacing (US #11)

**Date:** 2026-04-28
**Story:** Verify Account via Community Email — and surface org membership
across the public read surfaces so passengers can see "Maria from UPC ✓"
on a ride card before they book.

## What exists vs. UML

| UML field                                 | Reality                                                 |
| ----------------------------------------- | ------------------------------------------------------- |
| `user.email_verified`                     | ✅ already in `auth.schema.ts` (managed by better-auth) |
| `verification` table                      | ✅ already in `auth.schema.ts` (managed by better-auth) |
| `emailVerification.sendVerificationEmail` | ✅ already wired to Brevo in `auth.factory.ts`          |
| `organizations` table                     | ❌ missing — must add                                   |
| `user.organization_id`                    | ❌ missing — must add                                   |
| `afterEmailVerification` hook             | ❌ missing — must add                                   |

better-auth v1.6.9 provides `emailVerification.afterEmailVerification(updatedUser, request?)` — confirmed in `node_modules/better-auth/dist/api/routes/email-verification.mjs`.

## Schema additions

### `organizations` (new table in `src/core/database/schema/organizations.schema.ts`)

- `id` text PK
- `name` text NOT NULL
- `domain` text NOT NULL UNIQUE (normalized lowercase)
- `createdAt`, `updatedAt` timestamps

### `user` (add column in `src/core/database/schema/auth.schema.ts`)

- `organizationId` text NULLABLE FK → `organizations.id` ON DELETE SET NULL

The `organization_id` lives on `user` (identity), not `profile` (presentation).
Reasoning: it's set by the system at email verification, before any profile
exists, and it's not user-editable. Read paths that want to display the org
join through to `organizations`.

## New module: `src/modules/organizations/`

```
organizations/
├── domain/email-domain.ts          pure: extractEmailDomain(email) → string
├── dto/organization-summary.dto.ts shared embedded shape ({id, name})
├── dto/organization-response.dto.ts
├── dto/organization-match-response.dto.ts
├── dto/me-organization-response.dto.ts
├── dto/organization-list-item.dto.ts
├── dto/organization-detail.dto.ts
├── dto/create-organization.dto.ts
├── dto/create-organization-response.dto.ts
├── organizations.repository.ts
├── organizations.service.ts
├── organizations.mapper.ts
├── organizations.controller.ts
└── organizations.module.ts
```

## Endpoints

### Public read

- `GET /api/organizations/match?email=xxx` — public, no auth. Validates
  the email format, returns the most-specific matching org for the
  domain or any parent domain (`student@estudiantat.upc.edu` matches a
  `upc.edu` org if no `estudiantat.upc.edu` org exists). Used by the
  signup flow to render "We recognise UPC" before account creation.
- `GET /api/organizations/me` — authenticated. Returns the org the
  caller is linked to (or null).

### Admin

- `POST /api/organizations` — create an org. Side-effect: links every
  existing unlinked user whose email domain matches (exact or
  subdomain). Returns `{organization, linkedCount}`.
- `GET /api/organizations` — list all orgs with member counts.
- `GET /api/organizations/:id` — detail with full member list.
- `POST /api/organizations/:id/members/:userId` — manually link a user
  (admin override; doesn't require a domain match).
- `DELETE /api/organizations/:id/members/:userId` — unlink.

System-wide role changes (`'admin' | 'user'`) are **not** an
organizations concern — use better-auth's admin plugin
(`POST /api/auth/admin/set-role`, exposed via `auth.admin.setRole` on
the client). An earlier draft of this PR exposed
`PATCH /:id/members/:userId` to set role; it was dropped because it
duplicated the plugin endpoint and was misleadingly named (the path
implied org-scoped role mutation but wrote to the global `user.role`).

## Org surfacing on read paths (in scope for this PR)

Once `user.organization_id` exists, every public read of a user should
expose the linked org so the FE can render trust signals without an
extra round-trip:

- `GET /me/profile` and `GET /users/:userId/profile` add
  `organization: { id, name } | null` (joined via `user → organizations`).
- `GET /api/rides/:rideId` and `GET /api/rides` (search) add
  `driverOrganization: { id, name } | null` to the trip summary.
- `GET /api/trips/:tripId` and `GET /api/me/trips` add
  `driver.organization: { id, name } | null` to the driver summary.
- `GET /api/me/favorites` inherits the same enriched trip shape.

The shared embedded shape is `OrganizationSummaryDto` (`{id, name}`)
exported from the organizations module. The four projected join columns
(`driverId/Name/OrganizationId/OrganizationName`) are centralised in
`trips.types.ts` via a `toDriverRecord` helper so trips, rides, and
favorites stay in sync.

## Hook wiring

`auth.factory.ts` receives `OrganizationsService` as 4th arg. Adds:

```ts
emailVerification.afterEmailVerification: async (user) => {
  await organizationsService.linkVerifiedUserToOrganizationByEmail(user.id, user.email);
}
```

The service swallows `ORGANIZATION_DOMAIN_CONFLICT` in this path and
logs it instead of throwing, so email verification is never broken by a
linking conflict.

## Error codes

- `INVALID_EMAIL_FORMAT` — bad email passed to domain extractor.
- `ORGANIZATION_DOMAIN_CONFLICT` — user already linked to a different
  org (surfaced from manual endpoints only; hook swallows it with a log).
- `ORGANIZATION_DOMAIN_EXISTS` — `POST /organizations` rejects a
  duplicate domain.

## Migration

Generate with `pnpm run db:generate`, apply with `pnpm run db:migrate`.

## Tests

`test/organizations.e2e-spec.ts` covers:

- `match` returns org on known domain (exact and subdomain), unmatched
  on unknown domain, 400 on invalid email, anonymous-accessible.
- `POST /organizations` create + auto-link (exact + subdomain), domain
  conflict, role-gating (401, 403).
- `GET /organizations` listing with member counts.
- `GET /organizations/:id` detail with member list.
- `POST/DELETE /:id/members/:userId` link / unlink + role-gating.
- `GET /organizations/me` with and without a link.
- `linkVerifiedUserToOrganizationByEmail` direct: link, idempotency,
  conflict swallowing, parent-domain match.
- Profile responses (`GET /me/profile`, `GET /users/:userId/profile`)
  include `organization`.

`test/rides.e2e-spec.ts` adds:

- `GET /rides/:rideId` exposes `trip.driverOrganization` when the
  driver is linked, and null when they're not.
