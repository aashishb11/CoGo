import { Injectable, Inject } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type { DbClient } from '@core/database/database.module';
import { organizations, user } from '@core/database/schema';
import type * as schema from '@core/database/schema';
import type {
  InsertOrganization,
  Organization,
} from '@core/database/schema/organizations.schema';

// Returns every domain suffix worth checking, most specific first.
// 'estudiantat.upc.edu' → ['estudiantat.upc.edu', 'upc.edu']
// 'upc.edu'             → ['upc.edu']
// Single-part values like 'edu' are never included — too broad to be an org.
function domainCandidates(domain: string): string[] {
  const parts = domain.split('.');
  const candidates: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    candidates.push(parts.slice(i).join('.'));
  }
  return candidates;
}

@Injectable()
export class OrganizationsRepository {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  async findByDomain(
    tx: DbClient,
    domain: string,
  ): Promise<Organization | null> {
    const candidates = domainCandidates(domain);
    const [row] = await tx
      .select()
      .from(organizations)
      .where(inArray(organizations.domain, candidates))
      .orderBy(desc(sql`length(${organizations.domain})`))
      .limit(1);
    return row ?? null;
  }

  async findById(tx: DbClient, id: string): Promise<Organization | null> {
    const [row] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    return row ?? null;
  }

  async findOrganizationForUser(
    tx: DbClient,
    userId: string,
  ): Promise<Organization | null> {
    const [row] = await tx
      .select({
        id: organizations.id,
        name: organizations.name,
        domain: organizations.domain,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
      })
      .from(user)
      .innerJoin(organizations, eq(user.organizationId, organizations.id))
      .where(eq(user.id, userId))
      .limit(1);
    return row ?? null;
  }

  async setUserOrganization(
    tx: DbClient,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await tx.update(user).set({ organizationId }).where(eq(user.id, userId));
  }

  async getUserOrganizationId(
    tx: DbClient,
    userId: string,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ organizationId: user.organizationId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return row?.organizationId ?? null;
  }

  async findAll(
    tx: DbClient,
  ): Promise<(Organization & { memberCount: number })[]> {
    return tx
      .select({
        id: organizations.id,
        name: organizations.name,
        domain: organizations.domain,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        memberCount: count(user.id),
      })
      .from(organizations)
      .leftJoin(user, eq(user.organizationId, organizations.id))
      .groupBy(organizations.id)
      .orderBy(asc(organizations.name));
  }

  async findByIdWithMembers(
    tx: DbClient,
    id: string,
  ): Promise<
    | (Organization & {
        members: {
          id: string;
          name: string;
          email: string;
          role: string | null;
          createdAt: Date;
        }[];
      })
    | null
  > {
    const rows = await tx
      .select({
        id: organizations.id,
        name: organizations.name,
        domain: organizations.domain,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        memberId: user.id,
        memberName: user.name,
        memberEmail: user.email,
        memberRole: user.role,
        memberCreatedAt: user.createdAt,
      })
      .from(organizations)
      .leftJoin(user, eq(user.organizationId, organizations.id))
      .where(eq(organizations.id, id))
      .orderBy(asc(user.name));

    if (rows.length === 0) return null;

    const first = rows[0];
    const org: Organization = {
      id: first.id,
      name: first.name,
      domain: first.domain,
      createdAt: first.createdAt,
      updatedAt: first.updatedAt,
    };
    const members = rows
      .filter((r) => r.memberId !== null)
      .map((r) => ({
        id: r.memberId!,
        name: r.memberName!,
        email: r.memberEmail!,
        role: r.memberRole ?? null,
        createdAt: r.memberCreatedAt!,
      }));

    return { ...org, members };
  }

  async create(
    tx: DbClient,
    values: InsertOrganization,
  ): Promise<Organization> {
    const [row] = await tx.insert(organizations).values(values).returning();
    return row;
  }

  async addMember(tx: DbClient, orgId: string, userId: string): Promise<void> {
    await tx
      .update(user)
      .set({ organizationId: orgId })
      .where(eq(user.id, userId));
  }

  async removeMember(
    tx: DbClient,
    orgId: string,
    userId: string,
  ): Promise<boolean> {
    const updated = await tx
      .update(user)
      .set({ organizationId: null })
      .where(and(eq(user.id, userId), eq(user.organizationId, orgId)))
      .returning({ id: user.id });
    return updated.length > 0;
  }

  async linkUnlinkedUsersByDomain(
    tx: DbClient,
    orgId: string,
    domain: string,
  ): Promise<number> {
    const updated = await tx
      .update(user)
      .set({ organizationId: orgId })
      .where(
        and(
          isNull(user.organizationId),
          or(
            sql`lower(${user.email}) like ${'%@' + domain}`,
            sql`lower(${user.email}) like ${'%@%.' + domain}`,
          ),
        ),
      )
      .returning({ id: user.id });
    return updated.length;
  }

  async update(
    tx: DbClient,
    id: string,
    updates: Partial<Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Organization | null> {
    const [row] = await tx
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, id))
      .returning();
    return row ?? null;
  }
}
