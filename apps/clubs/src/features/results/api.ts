import { api } from "@moa/app-kit";

import { resultsSchema } from "./schemas";

/** The event's placings: every placed guest, and each competition track's teams. */
export async function fetchResults(eventId: number) {
  return resultsSchema.parse(await api.get<unknown>(`/api/v1/events/${eventId}/results`));
}

/** A team's placing within its track; every member of the team gets it. `null` clears it. */
export async function setTeamPlacing(eventId: number, teamId: number, position: number | null) {
  return resultsSchema.parse(await api.put<unknown>(`/api/v1/events/${eventId}/results/teams/${teamId}`, { position }));
}

/** One guest's placing (the winners route the server has had all along). `null` clears it. */
export async function setGuestPlacing(eventId: number, registrationId: string, position: number | null) {
  await api.put<unknown>(`/api/v1/events/registration/${eventId}/winners/${registrationId}`, { position });
}
