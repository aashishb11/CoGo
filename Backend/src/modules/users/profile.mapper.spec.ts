import { toProfileResponse, toPublicProfileResponse } from './profile.mapper';
import type { ProfileWithOrganization } from './profile.service';

const BASE_PROFILE: ProfileWithOrganization = {
  userId: 'usr_123',
  username: 'aitana',
  bio: 'Commuting from Mataró to Barcelona',
  phone: '+34600000000',
  locale: 'en',
  totalCo2Saved: 12.5,
  xpPoints: 100,
  ridesAsDriver: 4,
  ridesAsPassenger: 7,
  badges: [{ id: 'first_ride_driver', awardedAt: '2026-05-12T21:00:00.000Z' }],
  organization: { id: 'org_1', name: 'UPC' },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-01T00:00:00.000Z'),
};

describe('toProfileResponse', () => {
  it('exposes every authenticated-user field including phone and locale', () => {
    const response = toProfileResponse(BASE_PROFILE);

    expect(response).toEqual({
      userId: 'usr_123',
      username: 'aitana',
      bio: 'Commuting from Mataró to Barcelona',
      phone: '+34600000000',
      locale: 'en',
      totalCo2Saved: 12.5,
      xpPoints: 100,
      level: 1,
      xpToNextLevel: 300,
      ridesAsDriver: 4,
      ridesAsPassenger: 7,
      badges: BASE_PROFILE.badges,
      organization: { id: 'org_1', name: 'UPC' },
      createdAt: BASE_PROFILE.createdAt,
      updatedAt: BASE_PROFILE.updatedAt,
    });
  });

  it('derives level and xpToNextLevel from xpPoints via gamification rules', () => {
    const response = toProfileResponse({ ...BASE_PROFILE, xpPoints: 1600 });

    expect(response.level).toBe(4);
    expect(response.xpToNextLevel).toBe(900);
  });

  it('returns level 0 and 100 xp-to-next-level for a brand-new profile', () => {
    const response = toProfileResponse({ ...BASE_PROFILE, xpPoints: 0 });

    expect(response.level).toBe(0);
    expect(response.xpToNextLevel).toBe(100);
  });

  it('defaults badges to an empty array when null', () => {
    const response = toProfileResponse({
      ...BASE_PROFILE,
      badges: null as unknown as ProfileWithOrganization['badges'],
    });

    expect(response.badges).toEqual([]);
  });

  it('passes through nullable bio, phone, locale, and organization', () => {
    const response = toProfileResponse({
      ...BASE_PROFILE,
      bio: null,
      phone: null,
      locale: null,
      organization: null,
    });

    expect(response.bio).toBeNull();
    expect(response.phone).toBeNull();
    expect(response.locale).toBeNull();
    expect(response.organization).toBeNull();
  });
});

describe('toPublicProfileResponse', () => {
  it('omits phone, locale, and updatedAt from the public view', () => {
    const response = toPublicProfileResponse(BASE_PROFILE);

    expect(response).not.toHaveProperty('phone');
    expect(response).not.toHaveProperty('locale');
    expect(response).not.toHaveProperty('updatedAt');
  });

  it('exposes the user-discoverable fields including createdAt', () => {
    const response = toPublicProfileResponse(BASE_PROFILE);

    expect(response).toEqual({
      userId: 'usr_123',
      username: 'aitana',
      bio: 'Commuting from Mataró to Barcelona',
      totalCo2Saved: 12.5,
      xpPoints: 100,
      level: 1,
      xpToNextLevel: 300,
      ridesAsDriver: 4,
      ridesAsPassenger: 7,
      badges: BASE_PROFILE.badges,
      organization: { id: 'org_1', name: 'UPC' },
      createdAt: BASE_PROFILE.createdAt,
    });
  });

  it('defaults badges to an empty array when null', () => {
    const response = toPublicProfileResponse({
      ...BASE_PROFILE,
      badges: null as unknown as ProfileWithOrganization['badges'],
    });

    expect(response.badges).toEqual([]);
  });

  it('passes through nullable bio and organization', () => {
    const response = toPublicProfileResponse({
      ...BASE_PROFILE,
      bio: null,
      organization: null,
    });

    expect(response.bio).toBeNull();
    expect(response.organization).toBeNull();
  });
});
