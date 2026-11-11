import { ApiError } from "@moa/api";
import { api } from "@moa/app-kit";

import { givenBackListSchema, type GivenBack } from "./schemas";

/**
 * The tickets this event's guests gave back themselves, newest first. `null`
 * on a 404: an API without the route (an older server), or an event it no
 * longer finds; either way the view stays away.
 */
export async function fetchGivenBack(eventId: number): Promise<GivenBack[] | null> {
  try {
    return givenBackListSchema.parse(await api.get<unknown>(`/api/v1/events/registration/${eventId}/cancellations`)).items;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
