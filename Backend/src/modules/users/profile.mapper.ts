import { calcLevel, xpToNextLevel } from './domain/gamification';
import type { ProfileResponseDto } from './dto/profile-response.dto';
import type { PublicProfileResponseDto } from './dto/public-profile-response.dto';
import type { ProfileWithOrganization } from './profile.service';

export const toProfileResponse = (
  p: ProfileWithOrganization,
): ProfileResponseDto => ({
  userId: p.userId,
  username: p.username,
  bio: p.bio,
  phone: p.phone,
  locale: p.locale,
  totalCo2Saved: p.totalCo2Saved,
  xpPoints: p.xpPoints,
  level: calcLevel(p.xpPoints),
  xpToNextLevel: xpToNextLevel(p.xpPoints),
  ridesAsDriver: p.ridesAsDriver,
  ridesAsPassenger: p.ridesAsPassenger,
  badges: p.badges ?? [],
  organization: p.organization,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

export const toPublicProfileResponse = (
  p: ProfileWithOrganization,
): PublicProfileResponseDto => ({
  userId: p.userId,
  username: p.username,
  bio: p.bio,
  totalCo2Saved: p.totalCo2Saved,
  xpPoints: p.xpPoints,
  level: calcLevel(p.xpPoints),
  xpToNextLevel: xpToNextLevel(p.xpPoints),
  ridesAsDriver: p.ridesAsDriver,
  ridesAsPassenger: p.ridesAsPassenger,
  badges: p.badges ?? [],
  organization: p.organization,
  createdAt: p.createdAt,
});
