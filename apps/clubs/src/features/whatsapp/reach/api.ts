import { api } from "@moa/app-kit";

import { accountSchema } from "../schemas";
import { broadcastListSchema, broadcastSchema, previewSchema, reachSchema, spendSchema, type BroadcastKind, type Kinds, type Variables } from "./schemas";

const BASE = "/api/v1/clubs/whatsapp";

// ─── Routing by kind, Connect with Meta ──────────────────────────────────

export async function fetchReach() {
  return reachSchema.parse(await api.get<unknown>(`${BASE}/account/reach`));
}

export async function setKinds(kinds: Partial<Kinds>) {
  return reachSchema.parse(await api.patch<unknown>(`${BASE}/account/routing`, kinds));
}

/** What Meta's flow gave back, posted at once: its code lasts 30 seconds. */
export interface SignupBody {
  code: string;
  phone_number_id: string | null;
  messaging_account_ids: string[];
  waba_id: string | null;
  business_id: string | null;
  is_on_biz_app: boolean;
  event: string | null;
}

export async function connectWithMeta(body: SignupBody) {
  return accountSchema.parse(await api.post<unknown>(`${BASE}/account/embedded-signup`, body));
}

export interface SignupEventBody {
  event: "CANCEL" | "ERROR";
  current_step?: string | null;
  error_message?: string | null;
  error_code?: string | null;
  session_id?: string | null;
}

export async function reportSignupEvent(body: SignupEventBody) {
  await api.post<unknown>(`${BASE}/account/embedded-signup/event`, body);
}

// ─── Spend ───────────────────────────────────────────────────────────────

export async function fetchSpend() {
  return spendSchema.parse(await api.get<unknown>(`${BASE}/spend`));
}

// ─── Broadcasts ──────────────────────────────────────────────────────────

export interface BroadcastBody {
  template: string;
  language: string | null;
  kind?: BroadcastKind;
  event_id: number | null;
  variables: Variables;
  scheduled_at?: string | null;
}

export async function fetchBroadcasts(offset = 0, limit = 20) {
  return broadcastListSchema.parse(await api.get<unknown>(`${BASE}/broadcasts`, { query: { offset, limit } }));
}

export async function fetchBroadcast(id: number) {
  return broadcastSchema.parse(await api.get<unknown>(`${BASE}/broadcasts/${id}`));
}

export async function previewBroadcast(body: BroadcastBody) {
  return previewSchema.parse(await api.post<unknown>(`${BASE}/broadcasts/preview`, body));
}

export async function createBroadcast(body: BroadcastBody) {
  return broadcastSchema.parse(await api.post<unknown>(`${BASE}/broadcasts`, body));
}

export async function cancelBroadcast(id: number) {
  return broadcastSchema.parse(await api.post<unknown>(`${BASE}/broadcasts/${id}/cancel`));
}
