// Single source of truth for the rating score bounds. The DB enforces the
// same range via a CHECK constraint on `user_ratings.score`; the DTO
// re-uses these constants in `@Min` / `@Max` so a future change is
// localised to one file.
export const RATING_SCORE_MIN = 1;
export const RATING_SCORE_MAX = 5;

// Maximum comment length. Mirrors the FE-promised limit in
// `docs/plans/2026-05-25-frontend-integration.md` §7 ("comment ≤ 500
// characters"). Bounded so a pathological payload can't bloat the table
// or the admin list response.
export const RATING_COMMENT_MAX_LENGTH = 500;

// Reasons surfaced inside the `RATING_NOT_ELIGIBLE` payload's `details.reason`
// field. Kept as a literal tuple so any consumer (FE copy, error mapper) can
// derive the union from this single source.
export const RATING_NOT_ELIGIBLE_REASONS = [
  'ride_not_completed',
  'not_counterparty',
] as const;
export type RatingNotEligibleReason =
  (typeof RATING_NOT_ELIGIBLE_REASONS)[number];
