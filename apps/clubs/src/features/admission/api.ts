import { api } from "@moa/app-kit";

import { admissionSettingsSchema, numberedResultSchema } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/admission`;

export async function fetchAdmission(eventId: number) {
  return admissionSettingsSchema.parse(await api.get<unknown>(base(eventId)));
}
export async function updateAdmission(eventId: number, body: { prefix?: string | null; digits?: number; include_code?: boolean }) {
  return admissionSettingsSchema.parse(await api.patch<unknown>(base(eventId), body));
}
export async function numberEveryone(eventId: number) {
  return numberedResultSchema.parse(await api.post<unknown>(`${base(eventId)}/number-all`, {}));
}
