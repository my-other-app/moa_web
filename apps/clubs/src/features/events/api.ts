import { api } from "@moa/app-kit";

import { clubEventPageSchema } from "./schemas";

export interface ClubEventQuery {
  search?: string | undefined;
  /** undefined = all, true = past, false = upcoming. */
  isEnded?: boolean | undefined;
  offset: number;
  limit: number;
}

export async function fetchClubEvents(query: ClubEventQuery) {
  const raw = await api.get<unknown>("/api/v1/clubs/events/list", {
    query: {
      search: query.search,
      is_ended: query.isEnded,
      offset: query.offset,
      limit: query.limit,
    },
  });
  return clubEventPageSchema.parse(raw);
}

/**
 * The raw detail payload. Returned unparsed so it can share one cache entry
 * with the edit form, which parses the same response differently.
 */
export async function fetchEventDetail(eventId: number): Promise<unknown> {
  return api.get<unknown>(`/api/v1/events/info/${eventId}`);
}
