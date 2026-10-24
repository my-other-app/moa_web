import { api } from "@moa/app-kit";

import { eventSummarySchema } from "./schemas";

/** Everything the event's overview shows, in one response. */
export async function fetchEventSummary(eventId: number) {
  const raw = await api.get<unknown>(`/api/v1/events/${eventId}/summary`);
  return eventSummarySchema.parse(raw);
}
