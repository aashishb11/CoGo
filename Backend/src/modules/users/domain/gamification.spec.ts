import {
  calcRideXp,
  calcLevel,
  xpForLevel,
  xpToNextLevel,
  computeNewBadges,
} from './gamification';

describe('Gamification Domain', () => {
  describe('Level Boundaries', () => {
    it('verifies 99 XP is Level 0', () => {
      expect(calcLevel(99)).toBe(0);
      expect(xpToNextLevel(99)).toBe(1); // Next level is 1 (100 XP)
    });

    it('verifies 100 XP is Level 1', () => {
      expect(calcLevel(100)).toBe(1);
      expect(xpForLevel(1)).toBe(100);
      expect(xpToNextLevel(100)).toBe(300); // Next level is 2 (400 XP)
    });

    it('verifies 1599 XP is Level 3', () => {
      expect(calcLevel(1599)).toBe(3);
      expect(xpToNextLevel(1599)).toBe(1); // Next level is 4 (1600 XP)
    });

    it('verifies 1600 XP is Level 4', () => {
      expect(calcLevel(1600)).toBe(4);
      expect(xpForLevel(4)).toBe(1600);
      expect(xpToNextLevel(1600)).toBe(900); // Next level is 5 (2500 XP)
    });
  });

  describe('XP Logic', () => {
    it('calculates driver XP with CO2 bonus', () => {
      // 50 base + floor(10.5)*5 = 50 + 50 = 100
      expect(calcRideXp('driver', 10.5)).toBe(100);
    });

    it('calculates passenger XP with CO2 bonus', () => {
      // 30 base + floor(2.9)*5 = 30 + 10 = 40
      expect(calcRideXp('passenger', 2.9)).toBe(40);
    });

    it('calculates XP without CO2 bonus', () => {
      expect(calcRideXp('driver', 0)).toBe(50);
      expect(calcRideXp('passenger', 0)).toBe(30);
    });
  });

  describe('Badge Triggers', () => {
    it('awards first_ride_driver on first driver ride', () => {
      const badges = computeNewBadges({
        roleThisRide: 'driver',
        totalCo2SavedAfter: 0,
        xpPointsAfter: 50,
        totalRidesAfter: 1,
        existingBadgeIds: new Set(),
      });
      expect(badges).toContain('first_ride_driver');
    });

    it('does not award first_ride_driver for passenger ride', () => {
      const badges = computeNewBadges({
        roleThisRide: 'passenger',
        totalCo2SavedAfter: 0,
        xpPointsAfter: 30,
        totalRidesAfter: 1,
        existingBadgeIds: new Set(),
      });
      expect(badges).not.toContain('first_ride_driver');
    });

    it('awards ride_milestone_10 when reaching 10 rides', () => {
      const badges = computeNewBadges({
        roleThisRide: 'passenger',
        totalCo2SavedAfter: 50,
        xpPointsAfter: 500,
        totalRidesAfter: 10,
        existingBadgeIds: new Set(['first_ride_driver']),
      });
      expect(badges).toContain('ride_milestone_10');
      expect(badges).not.toContain('first_ride_driver'); // Already has it
    });

    it('awards co2_savior at exactly 100kg (inclusive threshold)', () => {
      const badges = computeNewBadges({
        roleThisRide: 'driver',
        totalCo2SavedAfter: 100.0,
        xpPointsAfter: 1000,
        totalRidesAfter: 5,
        existingBadgeIds: new Set(),
      });
      expect(badges).toContain('co2_savior');
    });

    it('does not award co2_savior below 100kg', () => {
      const badges = computeNewBadges({
        roleThisRide: 'driver',
        totalCo2SavedAfter: 99.99,
        xpPointsAfter: 1000,
        totalRidesAfter: 5,
        existingBadgeIds: new Set(),
      });
      expect(badges).not.toContain('co2_savior');
    });

    it('awards eco_warrior when reaching level 5', () => {
      // Level 5 requires 2500 XP
      const badges = computeNewBadges({
        roleThisRide: 'driver',
        totalCo2SavedAfter: 200,
        xpPointsAfter: 2500,
        totalRidesAfter: 20,
        existingBadgeIds: new Set(['co2_savior']),
      });
      expect(badges).toContain('eco_warrior');
    });
  });
});
