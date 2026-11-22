import { createApiClient } from "@moa/api";
import { GATEWAY_PREFIX } from "@moa/auth";
import { SESSION_RENEWAL, signInAgainPath } from "@moa/app-kit";

import {attendeeSummarySchema,
  captureResultSchema,
  gateAnswersResultSchema,
  gateContextSchema,
  gateQuestGuestSchema,
  handoverResultSchema,
  scanBatchResultSchema,
  scanResultSchema,
  walkupResultSchema,
  GATE_FEATURES,
  GATE_FEATURES_HEADER,
  type ScanBody,
  type WalkupBody, gateCatalogSchema, gateStoreOrderSchema } from "./schemas";
import { z } from "zod";

import { printRequestSchema } from "@/features/printing/schemas";

export const GATE_KEY_HEADER = "X-Gate-Key";

/** The door key, as a header for a fetch of our own (a card's PDF); never in a URL. */
export const gateHeaders = (key: string | null): Record<string, string> | undefined => (key ? { [GATE_KEY_HEADER]: key } : undefined);

const clients = new Map<string, ReturnType<typeof createApiClient>>();

const GATE_RENEWAL = { ...SESSION_RENEWAL, onEnded: () => window.location.assign(signInAgainPath(window.location)) };

/**
 * The gate's own client. With a door key it sends the key on every call, so a
 * phone opened on a gate link needs no account; without one, the session
 * cookie identifies the volunteer or the club as everywhere else.
 */
export const gateClient = (key: string | null) => {
  const k = key ?? "";
  let c = clients.get(k);
  if (!c) {
    c = createApiClient({
      baseUrl: GATEWAY_PREFIX,
      // This console knows stations and swag desks: said on every call (quests contract §7.5).
      getHeaders: (): Record<string, string> => ({ [GATE_FEATURES_HEADER]: GATE_FEATURES, ...(k ? { [GATE_KEY_HEADER]: k } : {}) }),
      // On a session, a long shift outlives the access token: renewed as
      // everywhere else, and once it can't be, sign in again and come back
      // (queued scans wait on the phone). A door key is no session: nothing to renew.
      renew: k ? undefined : GATE_RENEWAL,
    });
    clients.set(k, c);
  }
  return c;
};

const base = (eventId: number) => `/api/v1/events/${eventId}/gate`;

export async function fetchGateContext(key: string | null, eventId: number) {
  return gateContextSchema.parse(await gateClient(key).get<unknown>(`${base(eventId)}/context`));
}

/** Sends one guest's card to the print station from the door console (print-stations contract §2.3). */
export async function sendCardToPrinter(key: string | null, eventId: number, registrationId: string, override: boolean) {
  return printRequestSchema.parse(await gateClient(key).post<unknown>(`${base(eventId)}/print-request/${encodeURIComponent(registrationId)}`, { override }));
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
  return scanResultSchema.parse(await gateClient(key).post<unknown>(`${base(eventId)}/check-in/${encodeURIComponent(registrationId)}`, { door }));
}

export async function undoCheckIn(key: string | null, eventId: number, registrationId: string) {
  await gateClient(key).del<unknown>(`${base(eventId)}/check-in/${encodeURIComponent(registrationId)}`);
}

export async function captureContact(key: string | null, eventId: number, registrationId: string, phone: string) {
  return captureResultSchema.parse(await gateClient(key).post<unknown>(`${base(eventId)}/capture/${encodeURIComponent(registrationId)}`, { phone }));
}

/**
 * A guest's missing answers, filled at the door (missing-answers contract
 * §2.5): types are checked, nothing is required, and it counts as answered
 * for any open ask. Answers what is still missing.
 */
export async function saveGateAnswers(key: string | null, eventId: number, registrationId: string, answers: Record<string, string | string[]>) {
  return gateAnswersResultSchema.parse(await gateClient(key).post<unknown>(`${base(eventId)}/answers/${encodeURIComponent(registrationId)}`, { answers }));
}

/** Where this phone keeps the key and the door it was set to. */
export const KEY_STORAGE = (eventId: number) => `moa.gate.${eventId}.key`;
export const DOOR_STORAGE = (eventId: number) => `moa.gate.${eventId}.door`;

export async function fetchGateStoreOrders(key: string | null, eventId: number, registrationId: string) {
  return z.array(gateStoreOrderSchema).parse(await gateClient(key).get<unknown>(`/api/v1/events/${eventId}/gate/store/${encodeURIComponent(registrationId)}`));
}
export async function gateHandOver(key: string | null, eventId: number, orderId: string) {
  return gateStoreOrderSchema.parse(await gateClient(key).post<unknown>(`/api/v1/events/${eventId}/gate/store/${encodeURIComponent(orderId)}/handover`, {}));
}
/** At a swag desk, after a search: the guest's quest rewards and the stations they visited (§7.3). */
export async function fetchGateQuestGuest(key: string | null, eventId: number, registrationId: string) {
  return gateQuestGuestSchema.parse(await gateClient(key).get<unknown>(`${base(eventId)}/quests/${encodeURIComponent(registrationId)}`));
}

/** Hand one quest reward over at the swag desk; a size is sent when one is still to pick (or changes). */
export async function handOverQuestReward(key: string | null, eventId: number, claimId: string, body: { variant_label: string | null; door: string | null }) {
  return handoverResultSchema.parse(await gateClient(key).post<unknown>(`${base(eventId)}/quests/claims/${encodeURIComponent(claimId)}/handover`, body));
}

export async function fetchGateCatalog(key: string | null, eventId: number) {
  return gateCatalogSchema.parse(await gateClient(key).get<unknown>(`/api/v1/events/${eventId}/store/catalog`));
}
