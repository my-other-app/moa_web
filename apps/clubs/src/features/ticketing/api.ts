import { api } from "@moa/app-kit";

import {
  discountCodeSchema,
  discountCodesSchema,
  salesSchema,
  saveTypesBody,
  ticketTypesSchema,
  waitlistEntrySchema,
  waitlistSchema,
  waitlistSettingsSchema,
  type CodeForm,
  type EntryStatus,
  type SaveTypesBody,
  type TicketFormValues,
} from "./schemas";

const event = (eventId: number) => `/api/v1/events/${eventId}/ticketing`;

// ─── Ticket types ───────────────────────────────────────────────────────

/** GET /events/{id}/ticketing/types: every type, hidden ones too, with what sold. */
export async function fetchTicketTypes(eventId: number) {
  return ticketTypesSchema.parse(await api.get<unknown>(`${event(eventId)}/types`));
}

/** PUT /events/{id}/ticketing/types: the editor's list, saved at once. */
export async function putTicketTypes(eventId: number, body: SaveTypesBody) {
  return ticketTypesSchema.parse(await api.put<unknown>(`${event(eventId)}/types`, body));
}

/** The event form's types, saved: nothing when the form has nothing to say about them. */
export async function saveFormTicketTypes(eventId: number, values: TicketFormValues) {
  const body = saveTypesBody(values);
  if (!body) return null;
  return putTicketTypes(eventId, body);
}

/** GET /events/{id}/ticketing/sales: per type, and the codes used. */
export async function fetchTicketSales(eventId: number) {
  return salesSchema.parse(await api.get<unknown>(`${event(eventId)}/sales`));
}

// ─── Discount codes ─────────────────────────────────────────────────────

export interface CodeScope {
  /** An event's codes (its own and the club-wide ones); the club's page lists all. */
  eventId?: number | null;
}

/** The club's codes, or the ones an event takes. */
export async function fetchDiscountCodes(scope: CodeScope = {}) {
  const raw = scope.eventId ? await api.get<unknown>(`${event(scope.eventId)}/codes`) : await api.get<unknown>("/api/v1/clubs/discount-codes");
  return discountCodesSchema.parse(raw);
}

function codeBody(form: CodeForm) {
  return {
    kind: form.kind,
    value: form.value,
    ticket_type_ids: form.event_id && form.ticket_type_ids.length ? form.ticket_type_ids : null,
    starts_at: form.starts_at || null,
    ends_at: form.ends_at || null,
    max_uses: form.max_uses ?? null,
    per_person_limit: form.per_person_limit ?? null,
    is_active: form.is_active,
  };
}

export async function createDiscountCode(form: CodeForm) {
  const raw = await api.post<unknown>("/api/v1/clubs/discount-codes", {
    code: form.code,
    event_id: form.event_id ? Number(form.event_id) : null,
    ...codeBody(form),
  });
  return discountCodeSchema.parse(raw);
}

/** Everything but the code's text and its event, which never change. */
export async function updateDiscountCode(id: number, form: CodeForm) {
  return discountCodeSchema.parse(await api.patch<unknown>(`/api/v1/clubs/discount-codes/${id}`, codeBody(form)));
}

export async function setDiscountCodeActive(id: number, active: boolean) {
  return discountCodeSchema.parse(await api.patch<unknown>(`/api/v1/clubs/discount-codes/${id}`, { is_active: active }));
}

export async function deleteDiscountCode(id: number) {
  await api.del<unknown>(`/api/v1/clubs/discount-codes/${id}`);
}

// ─── Waiting lists ──────────────────────────────────────────────────────

export async function fetchWaitlist(eventId: number, status?: EntryStatus | null) {
  return waitlistSchema.parse(await api.get<unknown>(`${event(eventId)}/waitlist`, { query: { status: status ?? undefined, limit: 1000 } }));
}

export async function putWaitlistSettings(eventId: number, body: { enabled?: boolean; offer_hours?: number }) {
  return waitlistSettingsSchema.parse(await api.put<unknown>(`${event(eventId)}/waitlist/settings`, body));
}

/** Offer this person a place now: ahead of the line, or again after an offer ran out. */
export async function offerWaitlistEntry(eventId: number, entryId: string) {
  return waitlistEntrySchema.parse(await api.post<unknown>(`${event(eventId)}/waitlist/${entryId}/offer`));
}

export async function removeWaitlistEntry(eventId: number, entryId: string) {
  await api.del<unknown>(`${event(eventId)}/waitlist/${entryId}`);
}

/** The list as a CSV, through the dashboard's own gateway (the session's cookie goes with it). */
export const waitlistExportUrl = (eventId: number) => `/api/gateway/api/v1/events/${eventId}/ticketing/waitlist/export`;
