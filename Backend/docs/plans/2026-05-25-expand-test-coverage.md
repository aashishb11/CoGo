# 2026-05-25 — Expand unit-test coverage

## Why

`pnpm test:cov` currently reports **24.95% statements / 20.34% branches** across 25 spec files (194 tests). The existing tests are well-placed on domain logic (`gamification` 97%, `haversine` 100%, `boarding-token`, `traffic-watcher` 100%) and core flows in `wallet.service` and `rides-sweep`, but several high-value services are at or near zero. Adding focused unit tests both raises the headline number for PES evaluation and protects real flows.

## Scope

Two phases delivered in a single PR against `develop`.

### Phase 1 — pure-function specs (low cost, high coverage delta)

| Target                                                                 | Current | Why it matters                                                       |
| ---------------------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| `src/modules/users/profile.mapper.ts`                                  | 0%      | Sustainability math + nullable shaping; bug-prone, easy to lock down |
| `src/modules/wallet/wallet.mapper.ts`                                  | 0%      | Cents → decimal conversion; easy to regress silently                 |
| `src/modules/trips/rides/rides.mapper.ts`                              | 63%     | Lift to 100%; covers uncovered branches at lines 45/65/75            |
| `src/modules/trips/trips/dto/validators/is-ymd.validator.ts`           | 0%      | Pure validator; trivial to test                                      |
| `src/modules/trips/trips/dto/validators/music-consistent.validator.ts` | 0%      | Pure validator; cross-field rule worth pinning                       |
| `src/shared/i18n/locale.ts`                                            | 58%     | Locale fallback logic                                                |
| `src/shared/errors/throw.ts`                                           | 86%     | One uncovered branch                                                 |

### Phase 2 — service-layer specs (defect-protection focus)

| Target                                     | Current | Coverage goal                                                        |
| ------------------------------------------ | ------- | -------------------------------------------------------------------- |
| `src/modules/trips/trips/trips.service.ts` | 0%      | ~60% (create / update / cancel / list flows)                         |
| `src/modules/trips/rides/rides.service.ts` | 24%     | ~50% (search filtering, state transitions beyond `expire-unstarted`) |
| `src/modules/wallet/wallet.service.ts`     | 57%     | ~80% (topup + non-withdrawal paths)                                  |

### Out of scope (deliberately)

- Controllers — better covered by e2e tests; mocking guards/pipes is low-yield.
- Repositories — mocking Drizzle queries proves little; e2e against Postgres is the right level.
- Response DTOs, modules — zero defect-catching value.
- `scripts/generate-asyncapi.ts` — build-time script.

## Conventions

- Match existing style: `describe` per service/mapper, factory helpers like `mkWallet`, `BASE_TRIP`, AAA inside each `it`.
- Mock at the repository / external-service boundary; do not mock the unit under test.
- Use `jest.Mocked<T>` for typed mocks; keep test bodies free of `any`.
- Cover the **why** of each test in the `it` name (e.g. `"returns null co2 when totalDistanceKm is missing"`), not the implementation.
- Don't import deep internals — drive behaviour through the public method surface.

## Verification

- `pnpm lint`
- `pnpm type-check` (Husky `pre-push` enforces this anyway, but run locally first per [[feedback_cogo_backend_typecheck]]).
- `pnpm test`
- `pnpm test:cov` — capture the new % in the PR body.

## Realistic target

~50–55% overall after both phases, concentrated in load-bearing code rather than coverage padding.

## Follow-ups (not in this PR)

- Repository-level e2e tests against a Postgres test container.
- Controller e2e coverage extension (currently `test/jest-e2e.json`).
