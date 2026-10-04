import { api } from "@moa/app-kit";
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
 * Reject is destructive: the backend has no "rejected" state, so it soft-deletes
 * the club (SoftDeleteMixin). The UI must make that clear before confirming.
 */
export async function rejectClub(clubId: number): Promise<void> {
  await api.post<void>(`/api/v1/clubs/${clubId}/reject`);
}

export async function fetchClub(clubId: number): Promise<AdminClubDetail> {
  const raw = await api.get<unknown>(`/api/v1/clubs/admin/${clubId}`);
  return adminClubDetailSchema.parse(raw);
}

export interface SubListQuery {
  offset: number;
  limit: number;
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
