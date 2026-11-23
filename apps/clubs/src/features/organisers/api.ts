import { api } from "@moa/app-kit";

import { candidatesSchema, organisersSchema, type OrganiserInput } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/organisers`;

export async function fetchOrganisers(eventId: number) {
  return organisersSchema.parse(await api.get<unknown>(base(eventId)));
}

/** Everyone who can be named: the host's team, then each co-host's. */
export async function fetchOrganiserCandidates(eventId: number) {
  return candidatesSchema.parse(await api.get<unknown>(`${base(eventId)}/candidates`));
}

/** Replaces the whole set; the order sent is the order the page shows. An empty list means "the host club's whole team". */
export async function saveOrganisers(eventId: number, members: OrganiserInput[]) {
  await api.put<unknown>(base(eventId), { members });
}
