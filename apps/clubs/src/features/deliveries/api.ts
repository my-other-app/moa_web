import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import {
  certificateSummarySchema,
  deliveryChannelsStateSchema,
  deliveryLogSchema,
  deliverySummarySchema,
  sendResponseSchema,
  ticketStateSchema,
} from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}`;

export type SendScope = "unsent" | "failed" | "all";
export type DocumentKind = "ticket" | "certificate";
/** How a send reaches guests. "whatsapp" still emails whoever WhatsApp can't reach. */
export type ChannelMode = "email" | "whatsapp" | "both";
/** The automatic sends an event chooses channels for. */
export type ChannelKind = "ticket" | "reminder" | "certificate";
export type DeliveryChannels = Record<ChannelKind, ChannelMode>;

/** Where each kind of document is sent from. */
const sendBase = (eventId: number, kind: DocumentKind) => `${base(eventId)}/${kind === "ticket" ? "tickets" : "certificates"}`;

/** Email a kind of document. `unsent` reaches whoever has not been sent one; `failed` retries problems; `all` sends to everyone again. */
export async function sendDocuments(
  eventId: number,
  kind: DocumentKind,
  only: SendScope = "unsent",
  registrationIds?: string[],
  channels?: ChannelMode,
) {
  const raw = await api.post<unknown>(`${sendBase(eventId, kind)}/send`, {
    only,
    ...(registrationIds ? { registration_ids: registrationIds } : {}),
    ...(channels ? { channels } : {}),
  });
  return sendResponseSchema.parse(raw);
}

export const sendTickets = (eventId: number, only: SendScope = "unsent", registrationIds?: string[], channels?: ChannelMode) =>
  sendDocuments(eventId, "ticket", only, registrationIds, channels);

/** One guest's document again, delivered before or not. */
export async function sendOneDocument(eventId: number, kind: DocumentKind, registrationId: string, channels?: ChannelMode) {
  const raw = await api.post<unknown>(
    `${sendBase(eventId, kind)}/${encodeURIComponent(registrationId)}/send`,
    channels ? { channels } : undefined,
  );
  return sendResponseSchema.parse(raw);
}

export const sendOneTicket = (eventId: number, registrationId: string, channels?: ChannelMode) =>
  sendOneDocument(eventId, "ticket", registrationId, channels);

/** Per event: email, WhatsApp or both for the ticket, the day-before reminder and the certificate. */
export async function fetchDeliveryChannels(eventId: number) {
  const raw = await api.get<unknown>(`${base(eventId)}/delivery-channels`);
  return deliveryChannelsStateSchema.parse(raw);
}

export async function saveDeliveryChannels(eventId: number, body: DeliveryChannels) {
  const raw = await api.put<unknown>(`${base(eventId)}/delivery-channels`, body);
  return deliveryChannelsStateSchema.parse(raw);
}

export async function revokeTicket(eventId: number, registrationId: string, reason?: string) {
  const raw = await api.post<unknown>(`${base(eventId)}/tickets/${encodeURIComponent(registrationId)}/revoke`, { reason });
  return ticketStateSchema.parse(raw);
}

export async function reinstateTicket(eventId: number, registrationId: string) {
  const raw = await api.post<unknown>(`${base(eventId)}/tickets/${encodeURIComponent(registrationId)}/reinstate`);
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
