import { api } from "@moa/app-kit";

import { checkInLogSchema, doorSchema, gateSettingsSchema, linkSchema, teamSchema, type DoorKind, type GateSettings } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}`;

export async function fetchTeam(eventId: number) {
  return teamSchema.parse(await api.get<unknown>(`${base(eventId)}/team`));
}

export async function createDoor(eventId: number, body: { name: string; kind: DoorKind }) {
  return doorSchema.parse(await api.post<unknown>(`${base(eventId)}/doors`, body));
}

export async function updateDoor(eventId: number, doorId: string, body: { name?: string; kind?: DoorKind; active?: boolean; sort_order?: number; link_can_walkup?: boolean }) {
  return doorSchema.parse(await api.patch<unknown>(`${base(eventId)}/doors/${doorId}`, body));
}

export async function deleteDoor(eventId: number, doorId: string) {
  await api.del<unknown>(`${base(eventId)}/doors/${doorId}`);
}

export async function issueGateLink(eventId: number, doorId: string, body: { can_walkup: boolean; days?: number }) {
  return linkSchema.parse(await api.post<unknown>(`${base(eventId)}/doors/${doorId}/link`, body));
}

export async function revokeGateLink(eventId: number, doorId: string) {
  await api.del<unknown>(`${base(eventId)}/doors/${doorId}/link`);
}

export async function updateTeamVolunteer(eventId: number, volunteerId: number, body: { can_check_in?: boolean; can_walkup?: boolean; can_merch?: boolean; door_id?: string | null; clear_door?: boolean }) {
  return teamSchema.parse(await api.patch<unknown>(`${base(eventId)}/team/${volunteerId}`, body));
}

export async function updateGateSettings(eventId: number, body: Partial<GateSettings>) {
  return gateSettingsSchema.parse(await api.patch<unknown>(`${base(eventId)}/gate-settings`, body));
}

export interface CheckInLogQuery {
  eventId: number;
  q?: string | undefined;
  doorId?: string | undefined;
  via?: string | undefined;
  by?: number | undefined;
  order?: "newest" | "oldest";
  page: number;
  pageSize: number;
}

export async function fetchCheckInLog(q: CheckInLogQuery) {
  return checkInLogSchema.parse(
    await api.get<unknown>(`${base(q.eventId)}/check-ins`, { query: { q: q.q, door_id: q.doorId, via: q.via, by: q.by, order: q.order, page: q.page, page_size: q.pageSize } })
  );
}

export async function undoCheckIn(eventId: number, registrationId: string) {
  await api.del<unknown>(`${base(eventId)}/gate/check-in/${registrationId}`);
}
