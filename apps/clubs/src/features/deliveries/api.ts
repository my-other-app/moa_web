import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import {
  deliveryLogSchema,
  deliverySummarySchema,
  sendResponseSchema,
  ticketStateSchema,
} from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}`;

export type SendScope = "unsent" | "failed" | "all";

/** Email tickets. `unsent` reaches whoever has not been sent one; `failed` retries problems; `all` sends to everyone again. */
export async function sendTickets(eventId: number, only: SendScope = "unsent", registrationIds?: string[]) {
  const raw = await api.post<unknown>(`${base(eventId)}/tickets/send`, {
    only,
    ...(registrationIds ? { registration_ids: registrationIds } : {}),
  });
  return sendResponseSchema.parse(raw);
}

/** One guest's ticket again, delivered before or not. */
export async function sendOneTicket(eventId: number, registrationId: string) {
  const raw = await api.post<unknown>(`${base(eventId)}/tickets/${registrationId}/send`);
  return sendResponseSchema.parse(raw);
}

export async function revokeTicket(eventId: number, registrationId: string, reason?: string) {
  const raw = await api.post<unknown>(`${base(eventId)}/tickets/${registrationId}/revoke`, { reason });
  return ticketStateSchema.parse(raw);
}

export async function reinstateTicket(eventId: number, registrationId: string) {
  const raw = await api.post<unknown>(`${base(eventId)}/tickets/${registrationId}/reinstate`);
  return ticketStateSchema.parse(raw);
}

export async function fetchDeliverySummary(eventId: number, kind: "ticket" | "certificate" = "ticket") {
  const raw = await api.get<unknown>(`${base(eventId)}/deliveries/summary`, { query: { kind } });
  return deliverySummarySchema.parse(raw);
}

export interface DeliveryLogQuery {
  eventId: number;
  kind?: "ticket" | "certificate";
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
export const bundleUrl = (eventId: number) => `${GATEWAY_PREFIX}${base(eventId)}/tickets/bundle.zip`;
