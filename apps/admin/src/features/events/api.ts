import { api, cohostListingSchema, eventSummarySchema, fetchExport, saveBlob, type ExportFormat } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import {
  adminEventDetailSchema,
  adminEventPageSchema,
  eventAnalyticsSchema,
  eventCategoryListSchema,
  eventRegistrationPageSchema,
  reviewPageSchema,
  type ReviewTab,
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

/** The door as a shape, with the head counts around it. */
export async function fetchEventSummary(eventId: number) {
  const raw = await api.get<unknown>(`/api/v1/events/${eventId}/summary`);
  return eventSummarySchema.parse(raw);
}

/**
 * The event's host and every club ever invited to co-host it, in every
 * status (backend docs/COHOSTS.md). A platform admin reads it as `admin`.
 */
export async function fetchEventCohosts(eventId: number) {
  const raw = await api.get<unknown>(`/api/v1/events/${eventId}/cohosts`);
  return cohostListingSchema.parse(raw);
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
 * The guest list as an Excel workbook (the only format it comes in). A real
 * navigation rather than a fetch: the browser handles the file and the
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

export interface ReviewQuery {
  status: ReviewTab;
  /** Name, email or phone contains. */
  q?: string | undefined;
  /** The `next` of the page before. */
  after?: string | null | undefined;
  limit: number;
}

const reviewBase = (eventId: number) => `/api/v1/events/registration/${eventId}/requests`;

/**
 * One page of an event's registrations under review (or of one status):
 * the queue oldest first, any other status newest first, with every
 * status's count. Read-only for an admin, who may read any event's.
 */
export async function fetchUnderReview(eventId: number, query: ReviewQuery) {
  const raw = await api.get<unknown>(reviewBase(eventId), {
    query: {
      status: query.status,
      // The server takes a search of up to 100 characters.
      q: query.q?.trim().slice(0, 100) || undefined,
      after: query.after ?? undefined,
      limit: query.limit,
    },
  });
  return reviewPageSchema.parse(raw);
}

/**
 * Every registration under review, whatever its status, as the server's
 * Excel workbook or CSV. A fetch rather than a navigation, so a refusal (the
 * export needs export_data) is an error toast, not a file of JSON saved to
 * disk. Named as the server names it, else
 * `event-<id>-registrations-under-review.xlsx` (or `.csv`).
 */
export async function downloadUnderReview(eventId: number, format: ExportFormat): Promise<void> {
  const file = await fetchExport(`${GATEWAY_PREFIX}${reviewBase(eventId)}/export`, format, `event-${eventId}-registrations-under-review`);
  saveBlob(file.blob, file.filename);
}

/** A correction of someone's contact details: only the fields sent change. */
export interface PersonPatch {
  full_name?: string;
  email?: string;
  phone?: string;
}

/**
 * Correct a registration's name, email or phone (a support case). The same
 * route the club uses; an admin needs manage_content. Nothing is emailed.
 */
export async function correctRegistration(eventId: number, registrationId: string, patch: PersonPatch) {
  await api.patch<unknown>(`/api/v1/events/registration/${eventId}/info/${registrationId}`, patch);
}

/** Correct someone under review (or already reviewed): nothing is decided or emailed. */
export async function correctUnderReview(eventId: number, requestId: string, patch: PersonPatch) {
  await api.patch<unknown>(`${reviewBase(eventId)}/${requestId}`, patch);
}
