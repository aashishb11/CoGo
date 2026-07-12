export type OrgMember = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | null;
  createdAt: string;
};

export type Organization = {
  id: string;
  name: string;
  domain: string;
  members: OrgMember[];
  createdAt: string;
  updatedAt: string;
};

export type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | null;
  emailVerified: boolean;
  banned?: boolean | null;
  banReason?: string | null;
  createdAt: string;
};
