import { api } from "@moa/app-kit";

import {
  acceptedSchema,
  accessListSchema,
  inviteResponseSchema,
  invitePreviewSchema,
  meSchema,
  memberRowSchema,
  type MemberRole,
} from "./schemas";

const BASE = "/api/v1/clubs/access";

export async function fetchAccessList() {
  return accessListSchema.parse(await api.get<unknown>(BASE));
}

export async function fetchMyAccess() {
  return meSchema.parse(await api.get<unknown>(`${BASE}/me`));
}

export async function inviteMember(body: { email: string; full_name?: string; role: MemberRole }) {
  return inviteResponseSchema.parse(await api.post<unknown>(`${BASE}/invite`, body));
}

export async function resendInvite(id: number) {
  return inviteResponseSchema.parse(await api.post<unknown>(`${BASE}/${id}/resend`, {}));
}

export async function changeRole(id: number, role: MemberRole) {
  return memberRowSchema.parse(await api.patch<unknown>(`${BASE}/${id}`, { role }));
}

/** The WhatsApp permission: the club's own WhatsApp inbox and templates. Owner only. */
export async function setMemberWhatsApp(id: number, allowed: boolean) {
  return memberRowSchema.parse(await api.put<unknown>(`${BASE}/${id}/whatsapp`, { allowed }));
}

export async function removeMember(id: number) {
  await api.del<unknown>(`${BASE}/${id}`);
}

export async function changeMyPassword(body: { current_password: string; new_password: string }) {
  await api.post<unknown>(`${BASE}/me/password`, body);
}

export async function fetchInvite(token: string) {
  return invitePreviewSchema.parse(await api.get<unknown>(`${BASE}/invite/${encodeURIComponent(token)}`));
}

export async function acceptInvite(token: string, body: { full_name?: string; password: string }) {
  return acceptedSchema.parse(await api.post<unknown>(`${BASE}/invite/${encodeURIComponent(token)}/accept`, body));
}
