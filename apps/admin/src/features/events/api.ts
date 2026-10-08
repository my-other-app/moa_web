import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import {
  adminEventDetailSchema,
  adminEventPageSchema,
  eventAnalyticsSchema,
  eventCategoryListSchema,
  eventRegistrationPageSchema,
} from "./schemas";

export interface EventListQuery {
  search?: string | undefined;
  clubId?: number | undefined;
  orgId?: number | undefined;
  categoryId?: number | undefined;
  isEnded?: boolean | undefined;
  hasFee?: boolean | undefined;
  sort?: string | undefined;
  order?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchEvents(query: EventListQuery) {
  const raw = await api.get<unknown>("/api/v1/events/admin/list", {
    query: {
      search: query.search,
      club_id: query.clubId,
      org_id: query.orgId,
      category_id: query.categoryId,
      is_ended: query.isEnded,
      has_fee: query.hasFee,
      sort: query.sort,
      order: query.order,
      offset: query.offset,
      limit: query.limit,
    },
  });
  return adminEventPageSchema.parse(raw);
}

/** The category filter's options. Reference data, so cached for ten minutes. */
export async function fetchEventCategories() {
  const raw = await api.get<unknown>("/api/v1/events/categories/list");
  return eventCategoryListSchema.parse(raw);
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

/**
 * Record or clear a placing. `position` of null clears it.
 *
 * `is_won` and `position` were columns nothing ever wrote, which is why the
 * events_won, runner_up_count and podium_count badge metrics always read
 * zero. The endpoint sets both and re-runs the badge check for the holder.
 */
export async function setEventWinner(
  eventId: number,
  registrationId: string,
  position: number | null
): Promise<void> {
  await api.put<void>(
    `/api/v1/events/registration/${eventId}/winners/${registrationId}`,
    { position }
  );
}

/**
 * Multipart, like the club update, because the endpoint shares a handler
 * with poster upload. Every field is sent: the handler assigns what it
 * receives, so an omitted one is cleared rather than left alone.
 */
export async function updateEvent(
  eventId: number,
  input: Record<string, unknown>
): Promise<void> {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  await api.put<void>(`/api/v1/events/update/${eventId}`, form);
}

export async function fetchDeletedEvents(query: { offset: number; limit: number }) {
  const raw = await api.get<unknown>("/api/v1/events/admin/deleted/list", {
    query: { offset: query.offset, limit: query.limit },
  });
  return adminEventPageSchema.parse(raw);
}

export async function restoreEvent(eventId: number): Promise<void> {
  await api.post<void>(`/api/v1/events/admin/${eventId}/restore`);
}
