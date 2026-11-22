import { api } from "@moa/app-kit";

import { guestProfileSchema } from "./schemas";

/** One person by a registration's id or a registration request's id (a Review row has no registration until it is confirmed). */
export async function fetchGuestProfile(eventId: number, ref: string) {
  return guestProfileSchema.parse(await api.get<unknown>(`/api/v1/events/${eventId}/people/${encodeURIComponent(ref)}`));
}
