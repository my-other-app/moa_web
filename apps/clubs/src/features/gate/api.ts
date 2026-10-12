import { createApiClient } from "@moa/api";
import { GATEWAY_PREFIX } from "@moa/auth";

import {attendeeSummarySchema,
  captureResultSchema,
  gateContextSchema,
  scanBatchResultSchema,
  scanResultSchema,
  walkupResultSchema,
  type ScanBody,
  type WalkupBody, gateCatalogSchema, gateStoreOrderSchema } from "./schemas";
import { z } from "zod";

export const GATE_KEY_HEADER = "X-Gate-Key";

const clients = new Map<string, ReturnType<typeof createApiClient>>();

/**
 * The gate's own client. With a door key it sends the key on every call, so a
 * phone opened on a gate link needs no account; without one, the session
 * cookie identifies the volunteer or the club as everywhere else.
 */
export const gateClient = (key: string | null) => {
  const k = key ?? "";
  let c = clients.get(k);
  if (!c) {
    c = createApiClient({ baseUrl: GATEWAY_PREFIX, getHeaders: (): Record<string, string> => (k ? { [GATE_KEY_HEADER]: k } : {}) });
    clients.set(k, c);
  }
  return c;
};

const base = (eventId: number) => `/api/v1/events/${eventId}/gate`;

export async function fetchGateContext(key: string | null, eventId: number) {
  return gateContextSchema.parse(await gateClient(key).get<unknown>(`${base(eventId)}/context`));
}

export async function scanTicket(key: string | null, eventId: number, body: ScanBody) {
  return scanResultSchema.parse(await gateClient(key).post<unknown>(`${base(eventId)}/scan`, body));
}

export async function scanBatch(key: string | null, eventId: number, scans: ScanBody[]) {
  return scanBatchResultSchema.parse(await gateClient(key).post<unknown>(`${base(eventId)}/scan-batch`, { scans }));
}

export async function registerWalkup(key: string | null, eventId: number, body: WalkupBody) {
  return walkupResultSchema.parse(await gateClient(key).post<unknown>(`${base(eventId)}/walkup`, body));
}

export async function searchGuests(key: string | null, eventId: number, q: string) {
  return z.array(attendeeSummarySchema).parse(await gateClient(key).get<unknown>(`${base(eventId)}/search`, { query: { q } }));
}

export async function checkInByHand(key: string | null, eventId: number, registrationId: string, door: string | null) {
  return scanResultSchema.parse(await gateClient(key).post<unknown>(`${base(eventId)}/check-in/${registrationId}`, { door }));
}

export async function undoCheckIn(key: string | null, eventId: number, registrationId: string) {
  await gateClient(key).del<unknown>(`${base(eventId)}/check-in/${registrationId}`);
}

export async function captureContact(key: string | null, eventId: number, registrationId: string, phone: string) {
  return captureResultSchema.parse(await gateClient(key).post<unknown>(`${base(eventId)}/capture/${registrationId}`, { phone }));
}

/** Where this phone keeps the key and the door it was set to. */
export const KEY_STORAGE = (eventId: number) => `moa.gate.${eventId}.key`;
export const DOOR_STORAGE = (eventId: number) => `moa.gate.${eventId}.door`;

export async function fetchGateStoreOrders(key: string | null, eventId: number, registrationId: string) {
  return z.array(gateStoreOrderSchema).parse(await gateClient(key).get<unknown>(`/api/v1/events/${eventId}/gate/store/${registrationId}`));
}
export async function gateHandOver(key: string | null, eventId: number, orderId: string) {
  return gateStoreOrderSchema.parse(await gateClient(key).post<unknown>(`/api/v1/events/${eventId}/gate/store/${orderId}/handover`, {}));
}
export async function fetchGateCatalog(key: string | null, eventId: number) {
  return gateCatalogSchema.parse(await gateClient(key).get<unknown>(`/api/v1/events/${eventId}/store/catalog`));
}
