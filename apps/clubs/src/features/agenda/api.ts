import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import { agendaItemSchema, agendaSchema, type AgendaItemInput } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/agenda`;

export async function fetchAgenda(eventId: number) {
  return agendaSchema.parse(await api.get<unknown>(base(eventId)));
}
export async function createAgendaItem(eventId: number, body: AgendaItemInput) {
  return agendaItemSchema.parse(await api.post<unknown>(base(eventId), body));
}
export async function updateAgendaItem(eventId: number, itemId: string, body: Partial<AgendaItemInput>) {
  return agendaItemSchema.parse(await api.patch<unknown>(`${base(eventId)}/${itemId}`, body));
}
export async function deleteAgendaItem(eventId: number, itemId: string) {
  await api.del<unknown>(`${base(eventId)}/${itemId}`);
}
/** The programme as designed, fitted onto A4; opened in a new tab through the gateway. */
export const programmePdfUrl = (eventId: number, page?: "a4_portrait" | "a4_landscape") => `${GATEWAY_PREFIX}${base(eventId)}/programme.pdf${page ? `?page=${page}` : ""}`;
