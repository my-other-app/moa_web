import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import { eventAnalyticsSchema, registrationPageSchema } from "./schemas";
import type { RegistrationRole } from "./schemas";

export interface RegistrationQuery {
  eventId: number;
  search?: string | undefined;
  isAttended?: boolean | undefined;
  isPaid?: boolean | undefined;
  offset: number;
  limit: number;
}

export async function fetchRegistrations(q: RegistrationQuery) {
  const raw = await api.get<unknown>(`/api/v1/events/registration/${q.eventId}/list`, {
    query: {
      search: q.search,
      is_attended: q.isAttended,
      is_paid: q.isPaid,
      offset: q.offset,
      limit: q.limit,
    },
  });
  return registrationPageSchema.parse(raw);
}

export async function fetchEventAnalytics(eventId: number) {
  const raw = await api.get<unknown>(`/api/v1/events/registration/${eventId}/analytics`);
  return eventAnalyticsSchema.parse(raw);
}

/** Marks someone as having turned up. There is no un-mark endpoint. */
export async function markAttendance(eventId: number, registrationId: string) {
  await api.post<void>(
    `/api/v1/events/registration/${eventId}/attendance/${registrationId}`
  );
}

/**
 * Mark which role someone is attending as.
 *
 * This is what makes an event's speaker or staff design reachable: the
 * renderer picks a variant by this value, so a design with no way to assign
 * it would never be issued to anyone.
 */
export async function setRegistrationRole(
  eventId: number,
  registrationId: string,
  role: RegistrationRole
) {
  await api.put<unknown>(
    `/api/v1/events/registration/${eventId}/role/${registrationId}`,
    { role }
  );
}

/**
 * Export is a file download, so it is a plain link rather than a fetch —
 * routing it through the gateway keeps the auth cookie first-party, and
 * letting the browser handle the response avoids buffering the whole file
 * into memory just to re-trigger a download.
 */
export function exportUrl(
  eventId: number,
  filters: { isAttended?: boolean; isPaid?: boolean } = {}
): string {
  const params = new URLSearchParams();
  if (filters.isAttended !== undefined) params.set("is_attended", String(filters.isAttended));
  if (filters.isPaid !== undefined) params.set("is_paid", String(filters.isPaid));
  const qs = params.toString();
  return `${GATEWAY_PREFIX}/api/v1/events/registration/${eventId}/export${qs ? `?${qs}` : ""}`;
}
