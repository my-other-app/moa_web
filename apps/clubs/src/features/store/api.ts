import { api } from "@moa/app-kit";
import { z } from "zod";

import { orderSchema, ordersPageSchema, storeItemSchema, summarySchema, type ItemForm } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/store`;

export async function fetchStoreItems(eventId: number) {
  return z.array(storeItemSchema).parse(await api.get<unknown>(base(eventId)));
}

export async function fetchStoreSummary(eventId: number) {
  return summarySchema.parse(await api.get<unknown>(`${base(eventId)}/summary`));
}

export async function setStoreSettings(eventId: number, patch: { merch_enabled?: boolean; swag_enabled?: boolean }) {
  return z.object({ merch_enabled: z.boolean(), swag_enabled: z.boolean() }).parse(await api.patch<unknown>(`${base(eventId)}/settings`, patch));
}

function body(form: ItemForm, stockPerSize: number) {
  const sizes = form.variants ? form.variants.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return {
    name: form.name,
    price: form.price,
    stock: sizes.length > 0 ? null : form.stock === "" ? 0 : form.stock,
    variants: sizes.map((label) => ({ label, stock: stockPerSize })),
    available_roles: form.available_roles.length > 0 ? form.available_roles : null,
    free_roles: form.free_roles,
  };
}

export async function createStoreItem(eventId: number, form: ItemForm) {
  // With sizes, the stock typed is the stock of each size; the shelf is edited per size afterwards.
  const perSize = form.stock === "" ? 0 : form.stock;
  return storeItemSchema.parse(await api.post<unknown>(base(eventId), body(form, perSize)));
}

export async function updateStoreItem(eventId: number, id: string, patch: Record<string, unknown>) {
  return storeItemSchema.parse(await api.patch<unknown>(`${base(eventId)}/${id}`, patch));
}

export async function deleteStoreItem(eventId: number, id: string) {
  await api.del<unknown>(`${base(eventId)}/${id}`);
}

export async function fetchStoreOrders(eventId: number, params: { q?: string; page: number; page_size: number }) {
  return ordersPageSchema.parse(await api.get<unknown>(`${base(eventId)}/orders`, { query: params }));
}

export async function handOverOrder(eventId: number, orderId: string, undo = false) {
  return orderSchema.parse(await api.post<unknown>(`${base(eventId)}/orders/${orderId}/handover${undo ? "/undo" : ""}`, {}));
}
