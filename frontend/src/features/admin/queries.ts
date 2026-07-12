import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  banUser,
  createOrganization,
  getAdminUserById,
  listAdminUsers,
  listOrganizations,
  moveUserBetweenOrgs,
  removeMemberFromOrg,
  revokeUserSessions,
  setUserRole,
  unbanUser,
  updateAdminUser,
  verifyUserEmail,
} from './api';
import type { AdminUserListItem, Organization } from './types';

export const queryKeys = {
  orgs: () => ['admin', 'orgs'] as const,
  user: (id: string) => ['admin', 'user', id] as const,
  users: (search: string) => ['admin', 'users', search] as const,
} as const;

export function useAdminOrgs() {
  return useQuery({
    queryKey: queryKeys.orgs(),
    queryFn: listOrganizations,
  });
}

export function useAdminUser(userId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.user(userId ?? ''),
    queryFn: () => getAdminUserById(userId as string),
    enabled: Boolean(userId),
  });
}

export function useAdminUsers(searchValue: string) {
  const trimmed = searchValue.trim();
  return useQuery({
    queryKey: queryKeys.users(trimmed),
    queryFn: () => listAdminUsers({ searchValue: trimmed, limit: 50 }),
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOrganization,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.orgs() });
    },
  });
}

export function useMoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      fromOrgId,
      toOrgId,
    }: {
      userId: string;
      fromOrgId: string | null;
      toOrgId: string;
    }) => moveUserBetweenOrgs({ userId, fromOrgId, toOrgId }),
    onMutate: async ({ userId, toOrgId }) => {
      await qc.cancelQueries({ queryKey: queryKeys.orgs() });
      const prev = qc.getQueryData<Organization[]>(queryKeys.orgs());

      qc.setQueryData<Organization[]>(queryKeys.orgs(), (orgs = []) => {
        let movedMember: Organization['members'][number] | undefined;
        const without = orgs.map((org) => ({
          ...org,
          members: org.members.filter((m) => {
            if (m.id === userId) {
              movedMember = m;
              return false;
            }
            return true;
          }),
        }));
        if (!movedMember) return orgs;
        const member = movedMember;
        return without.map((org) =>
          org.id === toOrgId ? { ...org, members: [...org.members, member] } : org,
        );
      });

      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.orgs(), ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.orgs() });
    },
  });
}

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setUserRole,
    onMutate: async ({ userId, role }) => {
      await qc.cancelQueries({ queryKey: ['admin', 'users'] });

      const snapshot = qc.getQueriesData<{ users: AdminUserListItem[]; total: number }>({
        queryKey: ['admin', 'users'],
      });

      for (const [key, value] of snapshot) {
        if (!value) continue;
        qc.setQueryData<{ users: AdminUserListItem[]; total: number }>(key, {
          ...value,
          users: value.users.map((u) => (u.id === userId ? { ...u, role } : u)),
        });
      }

      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.snapshot) return;
      for (const [key, value] of ctx.snapshot) {
        qc.setQueryData(key, value);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      void qc.invalidateQueries({ queryKey: queryKeys.orgs() });
    },
  });
}

export function useVerifyUserEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => verifyUserEmail(userId),
    onSuccess: (_data, userId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.user(userId) });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useBanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, banReason }: { userId: string; banReason?: string }) => {
      await banUser(userId, banReason);
      // Force the banned user out of every active device. Better-auth's
      // ban-user endpoint marks the account but doesn't always invalidate
      // existing sessions, so we revoke them explicitly. Failures here
      // shouldn't undo the ban — swallow them and let the next API call
      // from the banned user fail naturally.
      try {
        await revokeUserSessions(userId);
      } catch {
        // best-effort; ban already succeeded
      }
    },
    onSuccess: (_data, { userId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.user(userId) });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useUnbanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => unbanUser(userId),
    onSuccess: (_data, userId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.user(userId) });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useRevokeUserSessions() {
  return useMutation({
    mutationFn: (userId: string) => revokeUserSessions(userId),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, userId }: { orgId: string; userId: string }) =>
      removeMemberFromOrg(orgId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.orgs() });
    },
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: Record<string, unknown> }) =>
      updateAdminUser(userId, data),
    onSuccess: (_data, { userId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.user(userId) });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}
