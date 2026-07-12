# Contributing

## Git flow

`main` and `develop` are protected: no direct pushes, 1 approval required, force-push and branch deletion disabled, stale reviews dismissed on new commits.

| Branch type | Pattern                  | Base      | Merges into        |
| ----------- | ------------------------ | --------- | ------------------ |
| Feature     | `feat/<description>`     | `develop` | `develop`          |
| Bug fix     | `fix/<description>`      | `develop` | `develop`          |
| Refactor    | `refactor/<description>` | `develop` | `develop`          |
| Release     | `release/<version>`      | `develop` | `main` + `develop` |
| Hotfix      | `hotfix/<description>`   | `main`    | `main` + `develop` |

## Commits

```
type: short description
```

Allowed types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`. Enforced via commitlint.

## Before opening a PR

- `pnpm lint` and `pnpm test` pass
- New services have unit tests (`*.spec.ts` next to the source)
- ESLint disables include a comment explaining why
- Description covers what changed, why, and how it was tested
