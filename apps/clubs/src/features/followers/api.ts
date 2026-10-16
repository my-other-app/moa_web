import { api } from "@moa/app-kit";

import { followerPageSchema, followerProfileSchema, followersInsightsSchema, followersListSchema, type FollowerPage, type FollowerSort, type Segment } from "./schemas";

export async function fetchClubFollowers(
  clubId: number,
  query: { offset: number; limit: number }
): Promise<FollowerPage> {
  const raw = await api.get<unknown>(`/api/v1/clubs/followers/${clubId}`, {
    query: { offset: query.offset, limit: query.limit },
  });
  return followerPageSchema.parse(raw);
}

export async function fetchFollowerProfile(clubId: number, userId: number) {
  const raw = await api.get<unknown>(`/api/v1/clubs/followers/${clubId}/${userId}`);
  return followerProfileSchema.parse(raw);
}

export interface FollowersQuery {
  segment: Segment;
  sort: FollowerSort;
  search?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchFollowersList(q: FollowersQuery) {
  return followersListSchema.parse(await api.get<unknown>("/api/v1/clubs/followers/list", { query: { segment: q.segment, sort: q.sort, search: q.search, offset: q.offset, limit: q.limit } }));
}

export async function fetchFollowersInsights() {
  return followersInsightsSchema.parse(await api.get<unknown>("/api/v1/clubs/followers/insights"));
}

/** The spreadsheet goes through the gateway like everything else; the browser just opens it. */
export const followersExportUrl = (segment: Segment) => `/api/gateway/api/v1/clubs/followers/export.csv?segment=${segment}`;
