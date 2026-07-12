// ── XP award constants ────────────────────────────────────────────────────────

export const XP_DRIVER_RIDE_COMPLETED = 50;
export const XP_PASSENGER_RIDE_COMPLETED = 30;
/** XP per whole kg of CO2 saved (rounded down). */
export const XP_PER_KG_CO2 = 5;

/**
 * Returns total XP to award for completing a ride.
 * `co2Kg` is the ride's actualCo2SavedKg — each participant receives the same
 * environmental bonus regardless of role.
 */
export function calcRideXp(
  role: 'driver' | 'passenger',
  co2Kg: number,
): number {
  const base =
    role === 'driver' ? XP_DRIVER_RIDE_COMPLETED : XP_PASSENGER_RIDE_COMPLETED;
  return base + Math.floor(co2Kg) * XP_PER_KG_CO2;
}

// ── Leveling formula ──────────────────────────────────────────────────────────

/**
 * Level = floor(sqrt(xpPoints / 100))
 * Level 1 requires 100 XP, level 2 requires 400, level 4 requires 1600, etc.
 * Level 0 is the starting state (0–99 XP).
 */
export function calcLevel(xpPoints: number): number {
  return Math.floor(Math.sqrt(xpPoints / 100));
}

/** XP required to reach `level` (inclusive lower bound of the band). */
export function xpForLevel(level: number): number {
  return level * level * 100;
}

export function xpToNextLevel(xpPoints: number): number {
  const currentLevel = calcLevel(xpPoints);
  const nextLevelXp = xpForLevel(currentLevel + 1);
  return nextLevelXp - xpPoints;
}

// ── Badge logic ───────────────────────────────────────────────────────────────

export const BADGE_IDS = [
  'first_ride_driver',
  'ride_milestone_10',
  'co2_savior',
  'eco_warrior',
] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

export interface BadgeTriggerContext {
  roleThisRide: 'driver' | 'passenger';
  totalCo2SavedAfter: number;
  xpPointsAfter: number;
  totalRidesAfter: number;
  existingBadgeIds: Set<string>;
}

/**
 * Returns only the *new* badges (not yet in `existingBadgeIds`) that the user
 * has just earned. Pure — no I/O.
 */
export function computeNewBadges(ctx: BadgeTriggerContext): BadgeId[] {
  const earned: BadgeId[] = [];

  if (
    !ctx.existingBadgeIds.has('first_ride_driver') &&
    ctx.roleThisRide === 'driver'
  ) {
    earned.push('first_ride_driver');
  }

  if (
    !ctx.existingBadgeIds.has('ride_milestone_10') &&
    ctx.totalRidesAfter >= 10
  ) {
    earned.push('ride_milestone_10');
  }

  if (
    !ctx.existingBadgeIds.has('co2_savior') &&
    ctx.totalCo2SavedAfter >= 100
  ) {
    earned.push('co2_savior');
  }

  if (
    !ctx.existingBadgeIds.has('eco_warrior') &&
    calcLevel(ctx.xpPointsAfter) >= 5
  ) {
    earned.push('eco_warrior');
  }

  return earned;
}

// ── Sustainability derived metrics ────────────────────────────────────────────

const KG_CO2_PER_TREE_PER_YEAR = 22; // IPCC average
const KG_CO2_PER_LITRE_GASOLINE = 2.31;

export interface SustainabilityMetrics {
  totalCo2SavedKg: number;
  equivalentTreesPerYear: number;
  equivalentFuelLitresSaved: number;
}

export function calcSustainabilityMetrics(
  totalCo2SavedKg: number,
): SustainabilityMetrics {
  return {
    totalCo2SavedKg: Math.round(totalCo2SavedKg * 100) / 100,
    equivalentTreesPerYear:
      Math.round((totalCo2SavedKg / KG_CO2_PER_TREE_PER_YEAR) * 100) / 100,
    equivalentFuelLitresSaved:
      Math.round((totalCo2SavedKg / KG_CO2_PER_LITRE_GASOLINE) * 100) / 100,
  };
}
