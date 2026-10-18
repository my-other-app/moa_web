import { api } from "@moa/app-kit";
import { toApiError } from "@moa/api";
import { GATEWAY_PREFIX } from "@moa/auth";
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

/** Everything that narrows the list. Shared with the CSV export verbatim. */
export interface UserFilters {
  search?: string | undefined;
  userType?: string | undefined;
  provider?: string | undefined;
  sort?: string | undefined;
  order?: string | undefined;
  /** true for active only, false for suspended only, omitted for both. */
  isActive?: boolean | undefined;
}

export interface UserListQuery extends UserFilters {
  offset: number;
  limit: number;
  /**
   * The page after the one that handed this out (its `next` link): a
   * keyset page, an index range rather than a skip past every row before
   * it. Sent instead of the offset when there is one.
   */
  cursor?: string | undefined;
}

/** The total is counted up to this and no further; past it X-Total-Capped is set. */
export const USER_TOTAL_CAP = 10_000;

/** A page of users, with what the response says beyond its JSON. */
export type UserListPage = AdminUserPage & {
  /** The total stopped counting at USER_TOTAL_CAP: there are at least that many. */
  capped: boolean;
  /** The cursor for the next page, when `next` carries one (an API from before pages by offset only). */
  nextCursor: string | null;
};

/** The `cursor` a `next` link carries, or null. */
export function cursorOf(next: string | null | undefined): string | null {
  if (!next) return null;
  const query = next.includes("?") ? next.slice(next.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get("cursor");
}

/**
 * The filters as query parameters.
 *
 * One function, used by both the list and the export, so a filter can never
 * apply to the table and not to the file it downloads -- an export that
 * silently ignores a filter looks complete and cannot be spotted by reading
 * it.
 */
function filterParams(filters: UserFilters) {
  return {
    search: filters.search,
    user_type: filters.userType,
    provider: filters.provider,
    sort: filters.sort,
    order: filters.order,
    is_active: filters.isActive,
  };
}

export async function fetchUsers(query: UserListQuery): Promise<UserListPage> {
  let capped = false;
  const raw = await api.get<unknown>("/api/v1/user/admin/list", {
    query: {
      ...filterParams(query),
      // A cursor names the page by its last row; an offset beside it means nothing.
      ...(query.cursor ? { cursor: query.cursor } : { offset: query.offset }),
      limit: query.limit,
    },
    onResponse: (response) => {
      capped = response.headers.get("X-Total-Capped") === "true";
    },
  });
  const page = adminUserPageSchema.parse(raw);
  return { ...page, capped, nextCursor: cursorOf(page.next) };
}

/**
 * Download every matching row as CSV.
 *
 * Fetched rather than linked so a refusal is a toast instead of a downloaded
 * file containing an error message -- and the endpoint does refuse: it sits
 * behind `export_data`, which a viewer does not have.
 *
 * The body is streamed by the API and passed through by the gateway, so the
 * whole user base is never held in memory server-side. It is held in the
 * browser as one Blob, which is the only place it has to be.
 */
export async function exportUsersCsv(filters: UserFilters): Promise<void> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filterParams(filters))) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();

  const response = await fetch(
    `${GATEWAY_PREFIX}/api/v1/user/admin/export${query ? `?${query}` : ""}`,
    { credentials: "include", headers: { Accept: "text/csv" } }
  );
  if (!response.ok) throw await toApiError(response);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    // The API names the file (it carries the timestamp); this is the fallback
    // for a browser that ignores Content-Disposition on a blob URL, which is
    // all of them.
    link.download = filenameOf(response) ?? "users.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoked, or the Blob is pinned in memory for the life of the document.
    URL.revokeObjectURL(url);
  }
}

function filenameOf(response: Response): string | null {
  const header = response.headers.get("content-disposition");
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? null;
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

/** Suspend or reinstate. `reason` is recorded in the audit log. */
export async function setUserActive(
  userId: number,
  isActive: boolean,
  reason?: string
): Promise<void> {
  await api.put<void>(`/api/v1/user/admin/${userId}/active`, {
    is_active: isActive,
    reason: reason?.trim() || null,
  });
}

export async function updateUser(
  userId: number,
  input: { full_name: string; email: string; phone?: string }
): Promise<void> {
  await api.put<void>(`/api/v1/user/admin/${userId}`, {
    full_name: input.full_name,
    email: input.email,
    // Sent as null rather than omitted so clearing a phone actually clears
    // it -- the handler skips None but applies an explicit empty value.
    phone: input.phone?.trim() ?? "",
  });
}

export async function deleteUser(userId: number): Promise<void> {
  await api.del<void>(`/api/v1/user/admin/${userId}`);
}

export async function setAdminRole(userId: number, role: string): Promise<void> {
  await api.put<void>(`/api/v1/user/admin/${userId}/role`, { role });
}

/**
 * Set another user's password.
 *
 * The only way to issue credentials: there is no unauthenticated
 * forgot-password flow, and a club created by an admin starts with a random
 * password nobody has seen.
 */
export async function resetUserPassword(input: {
  emailOrUsername: string;
  newPassword: string;
}): Promise<void> {
  await api.post("/api/v1/auth/admin/reset-password", {
    email_or_username: input.emailOrUsername.trim(),
    new_password: input.newPassword,
  });
}
