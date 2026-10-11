import { api } from "@moa/app-kit";

import { eventFiguresSchema, eventSummarySchema } from "./schemas";

/** Everything the event's overview shows, in one response. */
export async function fetchEventSummary(eventId: number) {
  const raw = await api.get<unknown>(`/api/v1/events/${eventId}/summary`);
  return eventSummarySchema.parse(raw);
}

/** The door as a shape, on its own, for a page that only needs the figures. */
export async function fetchEventFigures(eventId: number) {
  const raw = await api.get<unknown>(`/api/v1/events/${eventId}/figures`);
  return eventFiguresSchema.parse(raw);
}
