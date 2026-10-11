import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import {
  certificateSummarySchema,
  deliveryLogSchema,
  deliverySummarySchema,
  sendResponseSchema,
  ticketStateSchema,
} from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}`;

export type SendScope = "unsent" | "failed" | "all";
export type DocumentKind = "ticket" | "certificate";

/** Where each kind of document is sent from. */
const sendBase = (eventId: number, kind: DocumentKind) => `${base(eventId)}/${kind === "ticket" ? "tickets" : "certificates"}`;

/** Email a kind of document. `unsent` reaches whoever has not been sent one; `failed` retries problems; `all` sends to everyone again. */
export async function sendDocuments(eventId: number, kind: DocumentKind, only: SendScope = "unsent", registrationIds?: string[]) {
  const raw = await api.post<unknown>(`${sendBase(eventId, kind)}/send`, {
    only,
    ...(registrationIds ? { registration_ids: registrationIds } : {}),
  });
  return sendResponseSchema.parse(raw);
}

export const sendTickets = (eventId: number, only: SendScope = "unsent", registrationIds?: string[]) =>
  sendDocuments(eventId, "ticket", only, registrationIds);

/** One guest's document again, delivered before or not. */
export async function sendOneDocument(eventId: number, kind: DocumentKind, registrationId: string) {
  const raw = await api.post<unknown>(`${sendBase(eventId, kind)}/${registrationId}/send`);
  return sendResponseSchema.parse(raw);
}

export const sendOneTicket = (eventId: number, registrationId: string) => sendOneDocument(eventId, "ticket", registrationId);

export async function revokeTicket(eventId: number, registrationId: string, reason?: string) {
  const raw = await api.post<unknown>(`${base(eventId)}/tickets/${registrationId}/revoke`, { reason });
  return ticketStateSchema.parse(raw);
}

export async function reinstateTicket(eventId: number, registrationId: string) {
  const raw = await api.post<unknown>(`${base(eventId)}/tickets/${registrationId}/reinstate`);
  return ticketStateSchema.parse(raw);
}

/**
 * How many were reached, per channel. A certificate's "unsent" counts
 * against those issued one, which the certificates endpoint knows and the
 * generic one does not -- so each kind asks its own.
 */
export async function fetchDeliverySummary(eventId: number, kind: DocumentKind = "ticket") {
  if (kind === "certificate") {
    const raw = await api.get<unknown>(`${base(eventId)}/certificates/summary`);
    const c = certificateSummarySchema.parse(raw);
    return deliverySummarySchema.parse({ kind, registrations: c.issued, revoked: c.revoked, channels: c.channels });
  }
  const raw = await api.get<unknown>(`${base(eventId)}/deliveries/summary`, { query: { kind } });
  return deliverySummarySchema.parse(raw);
}

export interface DeliveryLogQuery {
  eventId: number;
  kind?: "ticket" | "certificate" | "message" | undefined;
  problem?: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

export async function fetchDeliveryLog(q: DeliveryLogQuery) {
  const raw = await api.get<unknown>(`${base(q.eventId)}/deliveries`, {
    query: {
      kind: q.kind,
      problem: q.problem ? true : undefined,
      search: q.search,
      page: q.page,
      page_size: q.pageSize,
    },
  });
  return deliveryLogSchema.parse(raw);
}

/**
 * The bundle is a file download, so it is a plain link rather than a fetch --
 * the browser handles the file and the cookie rides along because the gateway
 * is same-origin.
 */
export const bundleUrl = (eventId: number, kind: DocumentKind = "ticket") => `${GATEWAY_PREFIX}${sendBase(eventId, kind)}/bundle.zip`;
