import type { AdminUserListItem, OrgMember, Organization } from './types';

import { apiFetch, withParams } from '@/shared/api';

type OrgListItemDto = {
  id: string;
  name: string;
  domain: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

type OrgDetailDto = {
  id: string;
  name: string;
  domain: string;
  members: {
    id: string;
    name: string;
    email: string;
    role: string | null;
    createdAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
};

type CreateOrgResponseDto = {
  organization: {
    id: string;
    name: string;
    domain: string;
    createdAt: string;
    updatedAt: string;
  };
  linkedCount: number;
};

type ListUsersResponseDto = {
  users: {
    id: string;
    name: string;
    email: string;
    role?: string | null;
    emailVerified: boolean;
    createdAt: string;
    banned?: boolean | null;
    banReason?: string | null;
  }[];
  total: number;
  limit?: number;
  offset?: number;
};

function normalizeRole(role: string | null | undefined): 'admin' | 'user' | null {
  if (role === 'admin' || role === 'user') return role;
  return null;
}

function toOrgMember(dto: OrgDetailDto['members'][number]): OrgMember {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: normalizeRole(dto.role),
    createdAt: dto.createdAt,
  };
}

function toOrganization(detail: OrgDetailDto): Organization {
  return {
    id: detail.id,
    name: detail.name,
    domain: detail.domain,
    members: detail.members.map(toOrgMember),
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}

export async function listOrganizations(): Promise<Organization[]> {
  const items =
    (await apiFetch<OrgListItemDto[]>({
      path: '/api/organizations',
      method: 'GET',
    })) ?? [];

  // Hydrate each org with its full member list. Admin scale (handful of orgs).
  // Use allSettled so one stale id (race against a concurrent delete) doesn't
  // break the whole dashboard; allowNotFound lets 404s resolve to null instead
  // of throwing.
  const settled = await Promise.allSettled(
    items.map((item) =>
      apiFetch<OrgDetailDto>({
        path: withParams('/api/organizations/:id', { id: item.id }),
        method: 'GET',
        allowNotFound: true,
      }),
    ),
  );

  return settled
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((detail): detail is OrgDetailDto => detail !== null)
    .map(toOrganization);
}

export type CreateOrganizationInput = {
  name: string;
  domain: string;
};

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<{ organization: Organization['id']; linkedCount: number }> {
  const response = await apiFetch<CreateOrgResponseDto>({
    path: '/api/organizations',
    method: 'POST',
    body: input,
  });
  if (!response) {
    throw new Error('Empty create-organization response');
  }
  return {
    organization: response.organization.id,
    linkedCount: response.linkedCount,
  };
}

export async function addMemberToOrg(orgId: string, userId: string): Promise<void> {
  await apiFetch({
    path: withParams('/api/organizations/:id/members/:userId', { id: orgId, userId }),
    method: 'POST',
  });
}

export async function removeMemberFromOrg(orgId: string, userId: string): Promise<void> {
  await apiFetch({
    path: withParams('/api/organizations/:id/members/:userId', { id: orgId, userId }),
    method: 'DELETE',
  });
}

/**
 * Move a user from one org to another. Backend exposes only add/remove primitives,
 * so this is a sequenced DELETE + POST. If the POST fails after the DELETE
 * already succeeded the user would be orphaned — re-add them to the source org
 * as a server-side rollback before re-throwing.
 */
export async function moveUserBetweenOrgs(params: {
  userId: string;
  fromOrgId: string | null;
  toOrgId: string;
}): Promise<void> {
  const { userId, fromOrgId, toOrgId } = params;
  if (fromOrgId === toOrgId) return;
  if (fromOrgId) {
    await removeMemberFromOrg(fromOrgId, userId);
  }
  try {
    await addMemberToOrg(toOrgId, userId);
  } catch (error) {
    if (fromOrgId) {
      try {
        await addMemberToOrg(fromOrgId, userId);
      } catch {
        // Best-effort rollback. Surfacing the original error is more useful
        // than the rollback failure; the dashboard refetch on settle will
        // reveal the orphaned state if rollback also failed.
      }
    }
    throw error;
  }
}

export type ListAdminUsersInput = {
  searchValue?: string;
  limit?: number;
  offset?: number;
};

export async function listAdminUsers(
  input: ListAdminUsersInput = {},
): Promise<{ users: AdminUserListItem[]; total: number }> {
  const params = new URLSearchParams();
  if (input.searchValue && input.searchValue.trim()) {
    params.set('searchValue', input.searchValue.trim());
    params.set('searchField', 'email');
    params.set('searchOperator', 'contains');
  }
  if (input.limit !== undefined) params.set('limit', String(input.limit));
  if (input.offset !== undefined) params.set('offset', String(input.offset));

  const qs = params.toString();
  const path = qs ? `/api/auth/admin/list-users?${qs}` : '/api/auth/admin/list-users';

  const response = await apiFetch<ListUsersResponseDto>({ path, method: 'GET' });
  if (!response) {
    return { users: [], total: 0 };
  }
  return {
    users: response.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: normalizeRole(u.role),
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      banned: u.banned ?? null,
      banReason: u.banReason ?? null,
    })),
    total: response.total,
  };
}

type GetUserResponseDto = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  emailVerified: boolean;
  createdAt: string;
  banned?: boolean | null;
  banReason?: string | null;
};

export async function getAdminUserById(userId: string): Promise<AdminUserListItem | null> {
  const params = new URLSearchParams({ id: userId });
  const response = await apiFetch<GetUserResponseDto>({
    path: `/api/auth/admin/get-user?${params.toString()}`,
    method: 'GET',
    allowNotFound: true,
  });
  if (!response) return null;
  return {
    id: response.id,
    name: response.name,
    email: response.email,
    role: normalizeRole(response.role),
    emailVerified: response.emailVerified,
    createdAt: response.createdAt,
    banned: response.banned ?? null,
    banReason: response.banReason ?? null,
  };
}

export async function setUserRole(input: {
  userId: string;
  role: 'admin' | 'user';
}): Promise<void> {
  await apiFetch({
    path: '/api/auth/admin/set-role',
    method: 'POST',
    body: input,
  });
}

export async function updateAdminUser(
  userId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await apiFetch({
    path: '/api/auth/admin/update-user',
    method: 'POST',
    body: { userId, data },
  });
}

export async function verifyUserEmail(userId: string): Promise<void> {
  await updateAdminUser(userId, { emailVerified: true });
}

export async function banUser(userId: string, banReason?: string): Promise<void> {
  await apiFetch({
    path: '/api/auth/admin/ban-user',
    method: 'POST',
    body: { userId, ...(banReason ? { banReason } : {}) },
  });
}

export async function unbanUser(userId: string): Promise<void> {
  await apiFetch({
    path: '/api/auth/admin/unban-user',
    method: 'POST',
    body: { userId },
  });
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await apiFetch({
    path: '/api/auth/admin/revoke-user-sessions',
    method: 'POST',
    body: { userId },
  });
}
