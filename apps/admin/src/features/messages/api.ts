import { api } from "@moa/app-kit";

import { clubMessagesSchema, toOwnLimitsPayload, type OwnLimitsForm } from "./schemas";

/** GET /admin/messages/clubs/{id}: this month, the closed months, the club's own limits. */
export async function fetchClubMessages(clubId: number) {
  return clubMessagesSchema.parse(await api.get<unknown>(`/api/v1/admin/messages/clubs/${clubId}`));
}

/** PUT /admin/messages/clubs/{id}/limits: an Enterprise club's own limits. */
export async function setOwnLimits(clubId: number, form: OwnLimitsForm) {
  return clubMessagesSchema.parse(await api.put<unknown>(`/api/v1/admin/messages/clubs/${clubId}/limits`, toOwnLimitsPayload(form)));
}

/** DELETE /admin/messages/clubs/{id}/limits: back to the plan's. */
export async function clearOwnLimits(clubId: number) {
  return clubMessagesSchema.parse(await api.del<unknown>(`/api/v1/admin/messages/clubs/${clubId}/limits`));
}
