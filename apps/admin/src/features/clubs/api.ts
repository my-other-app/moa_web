import { api, clubLifetimeSchema } from "@moa/app-kit";
import {
  adminClubDetailSchema,
  adminClubPageSchema,
  clubEventPageSchema,
  clubFollowerPageSchema,
  type AdminClubDetail,
  type AdminClubPage,
  type ClubEditInput,
} from "./schemas";

export interface ClubListQuery {
  search?: string | undefined;
  /** Scopes to one organisation. Unverified clubs are included either way. */
  orgId?: number | undefined;
  isVerified?: boolean | undefined;
  sort?: string | undefined;
  order?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchClubs(query: ClubListQuery): Promise<AdminClubPage> {
  const raw = await api.get<unknown>("/api/v1/clubs/admin/list", {
    query: {
      search: query.search,
      org_id: query.orgId,
      is_verified: query.isVerified,
      sort: query.sort,
      order: query.order,
      offset: query.offset,
      limit: query.limit,
    },
  });
  return adminClubPageSchema.parse(raw);
}

export async function approveClub(clubId: number): Promise<void> {
  await api.post<void>(`/api/v1/clubs/${clubId}/approve`);
}

/**
 * Turn down a pending application, with the reason its applicant is mailed.
 * Only offered once the backend says it takes one (GET /admin/ops/me lists
 * "club_reject"); the server soft-deletes the club, as it always has.
 */
export async function rejectClub(clubId: number, reason: string): Promise<void> {
  await api.post<void>(`/api/v1/clubs/${clubId}/reject`, { reason });
}

export async function fetchClub(clubId: number): Promise<AdminClubDetail> {
  const raw = await api.get<unknown>(`/api/v1/clubs/admin/${clubId}`);
  return adminClubDetailSchema.parse(raw);
}

export interface SubListQuery {
  offset: number;
  limit: number;
}

/** What the club has done over every event it has run. */
export async function fetchClubLifetime(clubId: number) {
  const raw = await api.get<unknown>(`/api/v1/clubs/admin/${clubId}/lifetime`);
  return clubLifetimeSchema.parse(raw);
}

export async function fetchClubFollowers(clubId: number, query: SubListQuery) {
  const raw = await api.get<unknown>(`/api/v1/clubs/followers/${clubId}`, {
    query: { offset: query.offset, limit: query.limit },
  });
  return clubFollowerPageSchema.parse(raw);
}

export async function fetchClubEvents(clubId: number, query: SubListQuery) {
  const raw = await api.get<unknown>(`/api/v1/clubs/${clubId}/events`, {
    query: { offset: query.offset, limit: query.limit },
  });
  return clubEventPageSchema.parse(raw);
}

/**
 * Multipart, and complete: the handler assigns every column it receives and
 * deletes the interest links before re-adding the ids it was given, so an
 * omitted field is cleared rather than left alone. `org_id` is typed
 * `int | None`, so "no organisation" is the absence of the part -- an empty
 * string is a 422.
 */
export async function updateClub(clubId: number, input: ClubEditInput): Promise<void> {
  const form = new FormData();
  const text = {
    name: input.name,
    about: input.about ?? "",
    location_name: input.location_name ?? "",
    location_link: input.location_link ?? "",
    contact_email: input.contact_email ?? "",
    contact_phone: input.contact_phone ?? "",
    instagram: input.instagram ?? "",
    youtube: input.youtube ?? "",
    linkedin: input.linkedin ?? "",
    website: input.website ?? "",
  };
  for (const [key, value] of Object.entries(text)) form.append(key, value);
  if (input.org_id != null) form.append("org_id", String(input.org_id));
  form.append("interest_ids", input.interest_ids.join(","));

  await api.put<void>(`/api/v1/clubs/admin/${clubId}`, form);
}

export async function deleteClub(clubId: number): Promise<void> {
  await api.del<void>(`/api/v1/clubs/admin/${clubId}`);
}

/** Soft-deleted clubs, so a mistake can be found and undone. */
export async function fetchDeletedClubs(query: { offset: number; limit: number }) {
  const raw = await api.get<unknown>("/api/v1/clubs/admin/deleted/list", {
    query: { offset: query.offset, limit: query.limit },
  });
  return adminClubPageSchema.parse(raw);
}

export async function restoreClub(clubId: number): Promise<void> {
  await api.post<void>(`/api/v1/clubs/admin/${clubId}/restore`);
}

/**
 * Create a club directly, without waiting for someone to apply.
 *
 * The service generates a random password and deliberately does not return
 * it, so the club cannot sign in until an admin sets one -- which is why the
 * dialog sends the caller to the password reset straight afterwards.
 */
export async function createClub(input: {
  name: string;
  email: string;
}): Promise<{ id: number; name: string; email: string }> {
  return api.post("/api/v1/clubs/admin/create", {
    name: input.name.trim(),
    email: input.email.trim(),
  });
}
