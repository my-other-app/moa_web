import { api } from "@moa/app-kit";
import { z } from "zod";

import { orderSchema, ordersPageSchema, storeItemSchema, summarySchema, type OrderFilter } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/store`;

/** The club's items this event offers, with this event's sales and the shared stock left. */
export async function fetchStoreItems(eventId: number) {
  return z.array(storeItemSchema).parse(await api.get<unknown>(base(eventId)));
}

export async function fetchStoreSummary(eventId: number) {
  return summarySchema.parse(await api.get<unknown>(`${base(eventId)}/summary`));
}

export async function setStoreSettings(eventId: number, patch: { merch_enabled?: boolean; swag_enabled?: boolean }) {
  return z.object({ merch_enabled: z.boolean(), swag_enabled: z.boolean() }).parse(await api.patch<unknown>(`${base(eventId)}/settings`, patch));
}

/** Takes an item off this event only; it stays in the club's merchandise and on other events. */
export async function removeFromEvent(eventId: number, itemId: string) {
  await api.del<unknown>(`${base(eventId)}/${itemId}`);
}

export async function fetchStoreOrders(eventId: number, params: { q?: string; status?: OrderFilter; page: number; page_size: number }) {
  return ordersPageSchema.parse(await api.get<unknown>(`${base(eventId)}/orders`, { query: { ...params, status: params.status || undefined } }));
}

export async function handOverOrder(eventId: number, orderId: string, undo = false) {
  return orderSchema.parse(await api.post<unknown>(`${base(eventId)}/orders/${orderId}/handover${undo ? "/undo" : ""}`, {}));
}

/** Settles an oversold order once its pieces are there again: it becomes a paid order to hand over. */
export async function fulfilOrder(eventId: number, orderId: string) {
  return orderSchema.parse(await api.post<unknown>(`${base(eventId)}/orders/${orderId}/fulfil`, {}));
}
