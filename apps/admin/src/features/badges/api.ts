import { api } from "@moa/app-kit";

import {
  badgeListSchema,
  badgeRecipientsSchema,
  badgeStatsSchema,
  type Badge,
  type BadgeFormInput,
} from "./schemas";

export async function fetchBadges(): Promise<Badge[]> {
  const raw = await api.get<unknown>("/api/v1/badges/admin");
  return badgeListSchema.parse(raw);
}

export async function fetchBadgeStats(badgeId: number) {
  const raw = await api.get<unknown>(`/api/v1/badges/admin/${badgeId}/stats`);
  return badgeStatsSchema.parse(raw);
}

export async function fetchBadgeRecipients(badgeId: number) {
  const raw = await api.get<unknown>(`/api/v1/badges/admin/${badgeId}/recipients`);
  return badgeRecipientsSchema.parse(raw);
}

export async function createBadge(input: BadgeFormInput): Promise<void> {
  await api.post<void>("/api/v1/badges/admin", input);
}

/**
 * The update schema has no `badge_type`, and changing a slug would orphan
 * anything referencing it, so neither is sent on an edit.
 */
export async function updateBadge(
  badgeId: number,
  input: BadgeFormInput
): Promise<void> {
  const { slug: _slug, badge_type: _type, ...editable } = input;
  await api.put<void>(`/api/v1/badges/admin/${badgeId}`, editable);
}

export async function deleteBadge(badgeId: number): Promise<void> {
  await api.del<void>(`/api/v1/badges/admin/${badgeId}`);
}

/** Awards to a user id or a club id, depending on the badge's type. */
export async function awardBadge(badgeId: number, entityId: number): Promise<void> {
  await api.post<void>(`/api/v1/badges/admin/${badgeId}/award`, {
    entity_id: entityId,
  });
}

export async function revokeBadge(badgeId: number, entityId: number): Promise<void> {
  await api.del<void>(`/api/v1/badges/admin/${badgeId}/revoke/${entityId}`);
}
