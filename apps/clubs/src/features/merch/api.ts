import { api } from "@moa/app-kit";
import { z } from "zod";

import { gateClient } from "@/features/gate/api";

import { attendeeMerchSchema, collectResultSchema, merchAnalyticsSchema, merchFieldSchema, merchItemSchema, merchLogSchema, type MerchItemInput } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/merch`;

export async function fetchMerchItems(eventId: number) {
  return z.array(merchItemSchema).parse(await api.get<unknown>(base(eventId)));
}
export async function fetchMerchFields(eventId: number) {
  return z.array(merchFieldSchema).parse(await api.get<unknown>(`${base(eventId)}/fields`));
}
export async function createMerchItem(eventId: number, body: MerchItemInput) {
  return merchItemSchema.parse(await api.post<unknown>(base(eventId), body));
}
export async function updateMerchItem(eventId: number, itemId: string, body: Partial<MerchItemInput>) {
  return merchItemSchema.parse(await api.patch<unknown>(`${base(eventId)}/${itemId}`, body));
}
export async function deleteMerchItem(eventId: number, itemId: string, withCollections = false) {
  // The flag is a query parameter (with_collections=Query on the server): as
  // the second argument it went in the body, the server never saw it, and
  // removing an item guests had collected always failed with 409.
  await api.del<unknown>(`${base(eventId)}/${itemId}`, undefined, { query: { with_collections: withCollections } });
}
export async function addMerchVariant(eventId: number, itemId: string, body: { label: string; stock: number }) {
  return merchItemSchema.parse(await api.post<unknown>(`${base(eventId)}/${itemId}/variants`, body));
}
export async function updateMerchVariant(eventId: number, itemId: string, variantId: string, body: { label?: string; stock?: number }) {
  return merchItemSchema.parse(await api.patch<unknown>(`${base(eventId)}/${itemId}/variants/${variantId}`, body));
}
export async function deleteMerchVariant(eventId: number, itemId: string, variantId: string) {
  return merchItemSchema.parse(await api.del<unknown>(`${base(eventId)}/${itemId}/variants/${variantId}`));
}
export async function uploadMerchPhoto(eventId: number, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return z.object({ key: z.string(), url: z.string() }).parse(await api.post<unknown>(`${base(eventId)}/photo`, fd));
}

export interface MerchLogQuery {
  eventId: number;
  q?: string;
  itemId?: string;
  variantId?: string;
  doorId?: string;
  by?: number;
  order?: "newest" | "oldest";
  page?: number;
  pageSize?: number;
}
export async function fetchMerchLog(q: MerchLogQuery) {
  return merchLogSchema.parse(
    await api.get<unknown>(`${base(q.eventId)}/collections`, { query: { q: q.q, item_id: q.itemId, variant_id: q.variantId, door_id: q.doorId, by: q.by, order: q.order, page: q.page, page_size: q.pageSize } })
  );
}
export async function fetchMerchAnalytics(eventId: number) {
  return merchAnalyticsSchema.parse(await api.get<unknown>(`${base(eventId)}/analytics`));
}

// --- at the gate -----------------------------------------------------------------

const gate = (eventId: number) => `/api/v1/events/${eventId}/gate/merch`;

export async function fetchAttendeeMerch(key: string | null, eventId: number, registrationId: string) {
  return attendeeMerchSchema.parse(await gateClient(key).get<unknown>(`${gate(eventId)}/${registrationId}`));
}
export async function collectMerch(key: string | null, eventId: number, itemId: string, body: { registration_id: string; variant_label?: string; door?: string | null }) {
  return collectResultSchema.parse(await gateClient(key).post<unknown>(`${gate(eventId)}/${itemId}/collect`, body));
}

export async function handOutByHand(eventId: number, itemId: string, undo = false) {
  return merchItemSchema.parse(await api.post<unknown>(`${base(eventId)}/${itemId}/handout${undo ? "/undo" : ""}`, {}));
}
