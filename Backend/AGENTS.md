# AGENTS.md — Coding-agent instructions for cogo-backend

For human-facing onboarding, see [`README.md`](README.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), and [`docs/`](docs/). This file is for AI coding agents and does not repeat them.

## Read first

| For                                  | Read                                                                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codebase layout, layers, conventions | [`docs/architecture.md`](docs/architecture.md)                                                                                                                                                        |
| Error handling                       | [`docs/error-handling.md`](docs/error-handling.md)                                                                                                                                                    |
| Data model                           | [`docs/db-diagram.md`](docs/db-diagram.md) & [`docs/conceptual-diagram.md`](docs/conceptual-diagram.md) (intended, tracked); `schema.dbml` is generated locally via `pnpm run db:dbml` and gitignored |
| Deployment topology                  | [`docs/physical-diagram.md`](docs/physical-diagram.md)                                                                                                                                                |
| Branching, commits, PRs              | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                                                                                                                                  |

Run `pnpm lint`, `pnpm type-check`, and `pnpm test` before declaring a task done. `pnpm test` uses ts-jest in transpile-only mode and does not surface type errors in test files — `pnpm type-check` is the only command that does (and it's a separate CI job). A `pre-push` Husky hook runs `pnpm type-check` automatically. Don't disable ESLint without a comment explaining why.

## Be DRY — most common failure mode

Coding agents tend to add code rather than find existing code to reuse, which produces drift: two status tuples that disagree, two helpers that do the same thing, a constant duplicated between a DTO and the schema. Before writing a new type, constant, helper, or shape, **search for an existing one and reuse or extend it**.

Concretely, before adding code:

- `grep` for the name and nearby concepts.
- Check `<module>/<module>.types.ts` for status tuples and value objects in that module.
- Check `src/shared/` for cross-module primitives.
- Check `core/database/schema/` for table types — rows are typed via `$inferSelect` / `$inferInsert`; don't hand-roll parallel interfaces.
- Check `src/shared/errors/error-codes.ts` before adding a new error code.

If you must redeclare something, name the canonical source in a one-line comment.

DRY is cheap to verify and expensive to skip. Be thorough.

## Gatekeep the project's documented truth

These docs are the source of truth, and they evolve. As an agent, keep them coherent.

- If the user's request contradicts `AGENTS.md`, `CONTRIBUTING.md`, or anything in `docs/`, surface the conflict before complying. Quote the rule and ask: exception (with reason), or change the rule?
- Exception with justification → proceed; a one-line comment at the divergence pointing back to the canonical doc is usually enough.
- Decision to change the rule → update the doc in the same PR.
- One short question, then act on the answer. Don't re-ask if the user already justified.

## What does not belong in these docs

These describe project-wide truth, not individual preference. Don't add personal style choices, rules so specific they apply once, or cargo-culted "best practices" not actually followed here. If a rule starts with "I prefer…", it doesn't go in.

## Plans

For non-trivial work (multi-file, cross-repo, or design decisions), write a plan to [`docs/plans/`](docs/plans/) as a dated markdown file (e.g. `2026-04-28-rides-batch-bookings.md`). Once shipped, delete it or move durable parts into the relevant doc.

## Scope discipline

Do what the task asks. Don't refactor surrounding code, don't add abstractions for hypothetical future requirements, don't introduce error handling for cases that can't happen.
