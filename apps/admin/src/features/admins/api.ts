import { api } from "@moa/app-kit";

import {
  adminListSchema,
  inviteCheckSchema,
  inviteResultSchema,
  type AdminList,
  type InviteCheck,
  type InviteInput,
  type InviteResult,
} from "./schemas";

export async function fetchAdmins(): Promise<AdminList> {
  return adminListSchema.parse(await api.get<unknown>("/api/v1/admin/admins"));
}

export async function inviteAdmin(input: InviteInput): Promise<InviteResult> {
  const body = { email: input.email.trim(), role: input.role, ...(input.full_name?.trim() ? { full_name: input.full_name.trim() } : {}) };
  return inviteResultSchema.parse(await api.post<unknown>("/api/v1/admin/admins/invite", body));
}

export async function resendInvite(userId: number): Promise<void> {
  await api.post<unknown>(`/api/v1/admin/admins/${userId}/resend-invite`);
}

export async function removeAdmin(userId: number): Promise<void> {
  await api.del<unknown>(`/api/v1/admin/admins/${userId}`);
}

/** Public: whom a set-password link is for. */
export async function checkInvite(token: string): Promise<InviteCheck> {
  return inviteCheckSchema.parse(await api.get<unknown>("/api/v1/admin/invites/check", { query: { token } }));
}

/** Public: the invited admin's password. */
export async function acceptInvite(token: string, password: string): Promise<void> {
  await api.post<unknown>("/api/v1/admin/invites/accept", { token, password });
}
