import { api } from "@moa/app-kit";
import { adminClubPageSchema, type AdminClubPage } from "./schemas";

export interface ClubListQuery {
  search?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchClubs(query: ClubListQuery): Promise<AdminClubPage> {
  const raw = await api.get<unknown>("/api/v1/clubs/admin/list", {
    query: { search: query.search, offset: query.offset, limit: query.limit },
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
