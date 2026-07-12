# cogo-backend

REST API for CoGo. NestJS + Drizzle + PostgreSQL. Package manager: **pnpm** (enforced).

## Quickstart

```bash
pnpm install
docker compose up -d        # local PostgreSQL on :5432
pnpm run start:dev
```

Node version is pinned in [`.nvmrc`](.nvmrc) — run `nvm use` to match.

## Where things are

| Topic                                | File                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Codebase layout, layers, conventions | [`docs/architecture.md`](docs/architecture.md)                                                         |
| Error handling                       | [`docs/error-handling.md`](docs/error-handling.md)                                                     |
| Data model                           | [`docs/db-diagram.md`](docs/db-diagram.md), [`docs/conceptual-diagram.md`](docs/conceptual-diagram.md) |
| Deployment topology                  | [`docs/physical-diagram.md`](docs/physical-diagram.md)                                                 |
| Domain state machines                | [`docs/state-machines.md`](docs/state-machines.md)                                                     |
| Branching, commits, PRs              | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                                   |
| AI coding agents                     | [`AGENTS.md`](AGENTS.md)                                                                               |

**On the data model:** run `pnpm run db:dbml` to generate `schema.dbml` locally from the Drizzle schema — the file is gitignored and reflects the current schema. The diagrams in `docs/` describe the intended model and are the tracked source of truth.

## Useful commands

| Command                                             | Purpose                                     |
| --------------------------------------------------- | ------------------------------------------- |
| `pnpm run start:dev`                                | dev server (watch)                          |
| `pnpm run build`                                    | compile to `dist/`                          |
| `pnpm run test` / `test:e2e` / `test:cov`           | unit / e2e / merged coverage (unit + e2e)   |
| `pnpm run lint` / `format`                          | ESLint / Prettier                           |
| `pnpm run db:generate` / `db:migrate` / `db:studio` | Drizzle migrations + UI                     |
| `pnpm run db:dbml`                                  | generate `schema.dbml` locally (gitignored) |

## Deployment

Render auto-deploys from `main`. DB is Neon. `DATABASE_URL` is set in the Render dashboard.
