import { api } from "@moa/app-kit";
import {
  adminUserDetailSchema,
  adminUserPageSchema,
  userBadgesSchema,
  userClubPageSchema,
  userEventPageSchema,
  type AdminUserDetail,
  type AdminUserPage,
  type UserBadges,
} from "./schemas";

export interface UserListQuery {
  search?: string | undefined;
  userType?: string | undefined;
  provider?: string | undefined;
  sort?: string | undefined;
  order?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchUsers(query: UserListQuery): Promise<AdminUserPage> {
  const raw = await api.get<unknown>("/api/v1/user/admin/list", {
    query: {
      search: query.search,
      user_type: query.userType,
      provider: query.provider,
      sort: query.sort,
      order: query.order,
      offset: query.offset,
      limit: query.limit,
    },
  });
  return adminUserPageSchema.parse(raw);
}

export async function fetchUser(userId: number): Promise<AdminUserDetail> {
  const raw = await api.get<unknown>(`/api/v1/user/admin/${userId}`);
  return adminUserDetailSchema.parse(raw);
}

export interface UserSubListQuery {
  offset: number;
  limit: number;
}

export async function fetchUserClubs(userId: number, query: UserSubListQuery) {
  const raw = await api.get<unknown>(`/api/v1/user/admin/${userId}/clubs`, {
    query: { offset: query.offset, limit: query.limit },
  });
  return userClubPageSchema.parse(raw);
}

export interface UserEventQuery extends UserSubListQuery {
  isAttended?: boolean | undefined;
  isWon?: boolean | undefined;
  isPaid?: boolean | undefined;
}

export async function fetchUserEvents(userId: number, query: UserEventQuery) {
  const raw = await api.get<unknown>(`/api/v1/user/admin/${userId}/events`, {
    query: {
      offset: query.offset,
      limit: query.limit,
      // Omitted rather than sent as false: the endpoint treats a present
      // `false` as "only rows where the flag is off".
      is_attended: query.isAttended,
      is_won: query.isWon,
      is_paid: query.isPaid,
    },
  });
  return userEventPageSchema.parse(raw);
}

/** Badges are their own module; this is the admin-readable per-user view. */
export async function fetchUserBadges(userId: number): Promise<UserBadges> {
  const raw = await api.get<unknown>(`/api/v1/badges/user/${userId}`);
  return userBadgesSchema.parse(raw);
}
