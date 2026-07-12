import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import type { Organization } from '@core/database/schema/organizations.schema';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';
import { extractEmailDomain } from './domain/email-domain';
import { OrganizationsRepository } from './organizations.repository';

export type LinkResult =
  | { linked: true }
  | { linked: false; reason: 'no_org' | 'conflict' };

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly repo: OrganizationsRepository,
  ) {}

  async getAllOrganizations(): Promise<
    (Organization & { memberCount: number })[]
  > {
    return this.repo.findAll(this.db);
  }

  async addMember(orgId: string, targetUserId: string): Promise<void> {
    const org = await this.repo.findById(this.db, orgId);
    if (!org) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Organization not found.',
      });
    }
    await this.repo.addMember(this.db, orgId, targetUserId);
  }

  async removeMember(orgId: string, targetUserId: string): Promise<void> {
    const removed = await this.repo.removeMember(this.db, orgId, targetUserId);
    if (!removed) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User is not a member of this organization.',
      });
    }
  }

  async getOrganizationById(id: string) {
    const org = await this.repo.findByIdWithMembers(this.db, id);
    if (!org) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Organization not found.',
      });
    }
    return org;
  }

  async createOrganization(
    dto: CreateOrganizationDto,
  ): Promise<{ organization: Organization; linkedCount: number }> {
    const existing = await this.repo.findByDomain(this.db, dto.domain);
    if (existing) {
      throw new ConflictException({
        code: 'ORGANIZATION_DOMAIN_EXISTS',
        message: 'An organization with this domain already exists.',
      });
    }

    return this.db.transaction(async (tx) => {
      const organization = await this.repo.create(tx, {
        id: randomUUID(),
        name: dto.name,
        domain: dto.domain,
      });
      const linkedCount = await this.repo.linkUnlinkedUsersByDomain(
        tx,
        organization.id,
        organization.domain,
      );
      return { organization, linkedCount };
    });
  }

  async updateOrganization(
    id: string,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const org = await this.repo.findById(this.db, id);
    if (!org) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Organization not found.',
      });
    }

    if (dto.domain && dto.domain !== org.domain) {
      const existing = await this.repo.findByDomain(this.db, dto.domain);
      if (existing) {
        throw new ConflictException({
          code: 'ORGANIZATION_DOMAIN_EXISTS',
          message: 'An organization with this domain already exists.',
        });
      }
    }

    const updated = await this.repo.update(this.db, id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.domain !== undefined && { domain: dto.domain }),
    });

    if (!updated) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Organization not found.',
      });
    }

    return updated;
  }

  async findByEmailDomain(email: string): Promise<Organization | null> {
    const domain = extractEmailDomain(email);
    return this.repo.findByDomain(this.db, domain);
  }

  async getUserOrganization(userId: string): Promise<Organization | null> {
    return this.repo.findOrganizationForUser(this.db, userId);
  }

  /**
   * Links a verified user to the organization whose domain matches their email.
   *
   * Safe to call from the better-auth afterEmailVerification hook:
   * - no-op when no organization matches
   * - idempotent when already linked to the same organization
   * - logs and returns a conflict result instead of throwing when already linked
   *   to a *different* organization (so email verification is never broken)
   *
   * Throws ORGANIZATION_DOMAIN_CONFLICT (409) only when called from a context
   * that should surface conflicts (e.g. a future manual-link endpoint).
   */
  async linkVerifiedUserToOrganizationByEmail(
    userId: string,
    email: string,
    { throwOnConflict = false }: { throwOnConflict?: boolean } = {},
  ): Promise<LinkResult> {
    const domain = extractEmailDomain(email);
    const org = await this.repo.findByDomain(this.db, domain);

    if (!org) {
      return { linked: false, reason: 'no_org' };
    }

    const currentOrgId = await this.repo.getUserOrganizationId(this.db, userId);

    if (currentOrgId === org.id) {
      return { linked: true };
    }

    if (currentOrgId !== null && currentOrgId !== org.id) {
      if (throwOnConflict) {
        throw new ConflictException({
          code: 'ORGANIZATION_DOMAIN_CONFLICT',
          message:
            'User is already linked to a different organization. Unlink first.',
        });
      }
      this.logger.warn(
        `User ${userId} is already linked to org ${currentOrgId}; skipping link to ${org.id} (domain: ${domain})`,
      );
      return { linked: false, reason: 'conflict' };
    }

    await this.repo.setUserOrganization(this.db, userId, org.id);
    return { linked: true };
  }
}
