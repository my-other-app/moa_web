import { api } from "@moa/app-kit";

import { clubEventPageSchema, eventsFiguresSchema, type EventRoleFilter, type EventScope, type EventSort } from "./schemas";

export interface ClubEventQuery {
  search?: string | undefined;
  /** undefined = all, true = past, false = upcoming. The older switch; `scope` is finer. */
  isEnded?: boolean | undefined;
  scope?: EventScope | undefined;
  sort?: EventSort | undefined;
  /** Co-hosted events: the club's own, the ones it co-hosts, or both (the server's default, sent as nothing). */
  role?: Exclude<EventRoleFilter, "all"> | undefined;
  offset: number;
  limit: number;
}

export async function fetchClubEvents(query: ClubEventQuery) {
  const raw = await api.get<unknown>("/api/v1/clubs/events/list", {
    query: {
      search: query.search,
      is_ended: query.isEnded,
      scope: query.scope,
      sort: query.sort,
      role: query.role,
      offset: query.offset,
      limit: query.limit,
    },
  });
  return clubEventPageSchema.parse(raw);
}

export async function fetchEventsFigures() {
  return eventsFiguresSchema.parse(await api.get<unknown>("/api/v1/clubs/events/figures"));
}

/**
 * The raw detail payload. Returned unparsed so it can share one cache entry
 * with the edit form, which parses the same response differently.
 */
export async function fetchEventDetail(eventId: number): Promise<unknown> {
  return api.get<unknown>(`/api/v1/events/info/${eventId}`);
}
