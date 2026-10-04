import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import {
  adminEventDetailSchema,
  adminEventPageSchema,
  eventAnalyticsSchema,
  eventRegistrationPageSchema,
} from "./schemas";

export interface EventListQuery {
  search?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchEvents(query: EventListQuery) {
  const raw = await api.get<unknown>("/api/v1/events/admin/list", {
    query: { search: query.search, offset: query.offset, limit: query.limit },
  });
  return adminEventPageSchema.parse(raw);
}

export async function fetchEvent(eventId: number) {
  const raw = await api.get<unknown>(`/api/v1/events/info/${eventId}`);
  return adminEventDetailSchema.parse(raw);
}

export async function fetchEventAnalytics(eventId: number) {
  const raw = await api.get<unknown>(
    `/api/v1/events/registration/${eventId}/analytics`
  );
  return eventAnalyticsSchema.parse(raw);
}

export interface RegistrationQuery {
  offset: number;
  limit: number;
  search?: string | undefined;
  isAttended?: boolean | undefined;
}

export async function fetchEventRegistrations(
  eventId: number,
  query: RegistrationQuery
) {
  const raw = await api.get<unknown>(`/api/v1/events/registration/${eventId}/list`, {
    query: {
      offset: query.offset,
      limit: query.limit,
      search: query.search,
      // Omitted rather than false: the endpoint treats a present `false` as
      // "only rows where the flag is off".
      is_attended: query.isAttended,
    },
  });
  return eventRegistrationPageSchema.parse(raw);
}

export async function deleteEvent(eventId: number): Promise<void> {
  await api.del<void>(`/api/v1/events/delete/${eventId}`);
}

/**
 * A real navigation rather than a fetch: the browser handles the file and the
 * cookie rides along because the gateway is same-origin.
 */
export function eventExportUrl(eventId: number): string {
  return `${GATEWAY_PREFIX}/api/v1/events/registration/${eventId}/export`;
}
