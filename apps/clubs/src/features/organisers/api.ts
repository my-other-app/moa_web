import { api } from "@moa/app-kit";

import { organisersSchema, type OrganiserInput } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/organisers`;

export async function fetchOrganisers(eventId: number) {
  return organisersSchema.parse(await api.get<unknown>(base(eventId)));
}

/** Replaces the whole set; the order sent is the order the page shows. An empty list means "the whole club team". */
export async function saveOrganisers(eventId: number, members: OrganiserInput[]) {
  await api.put<unknown>(base(eventId), { members });
}
