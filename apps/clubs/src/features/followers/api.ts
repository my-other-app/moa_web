import { api } from "@moa/app-kit";

import { followerPageSchema, followerProfileSchema, type FollowerPage } from "./schemas";

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
