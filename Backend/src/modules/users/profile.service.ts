import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { organizations, profile, user } from '@core/database/schema';

import {
  calcLevel,
  calcSustainabilityMetrics,
  xpToNextLevel,
} from './domain/gamification';
import type { CreateProfileDto } from './dto/create-profile.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { SustainabilityResponseDto } from './dto/sustainability-response.dto';

type PersistedProfile = typeof profile.$inferSelect;
export type ProfileWithOrganization = PersistedProfile & {
  organization: { id: string; name: string } | null;
};

@Injectable()
export class ProfileService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  async create(
    userId: string,
    input: CreateProfileDto,
  ): Promise<ProfileWithOrganization> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      throw new ConflictException('Profile already exists for this user');
    }

    await this.db.insert(profile).values({
      userId,
      username: input.username,
      bio: input.bio ?? null,
      phone: input.phone ?? null,
      locale: input.locale ?? null,
    });

    return this.getByUserId(userId);
  }

  async getByUserId(userId: string): Promise<ProfileWithOrganization> {
    const found = await this.findByUserId(userId);
    if (!found) {
      throw new NotFoundException('Profile not found');
    }
    return found;
  }

  async update(
    userId: string,
    input: UpdateProfileDto,
  ): Promise<ProfileWithOrganization> {
    await this.getByUserId(userId);

    await this.db
      .update(profile)
      .set({
        ...(input.username !== undefined && { username: input.username }),
        ...(input.bio !== undefined && { bio: input.bio ?? null }),
        ...(input.phone !== undefined && { phone: input.phone ?? null }),
        ...(input.locale !== undefined && { locale: input.locale ?? null }),
      })
      .where(eq(profile.userId, userId));

    return this.getByUserId(userId);
  }

  async getSustainability(userId: string): Promise<SustainabilityResponseDto> {
    const p = await this.getByUserId(userId);
    const metrics = calcSustainabilityMetrics(p.totalCo2Saved);
    return {
      userId: p.userId,
      totalXp: p.xpPoints,
      xpToNextLevel: xpToNextLevel(p.xpPoints),
      level: calcLevel(p.xpPoints),
      metrics,
    };
  }

  private async findByUserId(
    userId: string,
  ): Promise<ProfileWithOrganization | null> {
    const [row] = await this.db
      .select({
        userId: profile.userId,
        username: profile.username,
        bio: profile.bio,
        phone: profile.phone,
        locale: profile.locale,
        totalCo2Saved: profile.totalCo2Saved,
        xpPoints: profile.xpPoints,
        ridesAsDriver: profile.ridesAsDriver,
        ridesAsPassenger: profile.ridesAsPassenger,
        badges: profile.badges,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        organizationId: organizations.id,
        organizationName: organizations.name,
      })
      .from(profile)
      .leftJoin(user, eq(user.id, profile.userId))
      .leftJoin(organizations, eq(organizations.id, user.organizationId))
      .where(eq(profile.userId, userId))
      .limit(1);

    if (!row) return null;
    return {
      userId: row.userId,
      username: row.username,
      bio: row.bio,
      phone: row.phone,
      locale: row.locale,
      totalCo2Saved: row.totalCo2Saved,
      xpPoints: row.xpPoints,
      ridesAsDriver: row.ridesAsDriver,
      ridesAsPassenger: row.ridesAsPassenger,
      badges: row.badges ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      organization: row.organizationId
        ? { id: row.organizationId, name: row.organizationName! }
        : null,
    };
  }
}
