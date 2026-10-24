import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import {
  accountSchema,
  conversationListSchema,
  conversationSchema,
  messageListSchema,
  messageSchema,
  overviewSchema,
  standardInstallSchema,
  templateBody,
  templateListSchema,
  type InboxFilter,
  type Keys,
  type TemplateForm,
} from "./schemas";

const BASE = "/api/v1/clubs/whatsapp";

/** Where the browser opens the inbox's stream: this app's gateway, which adds the session. */
export const STREAM_URL = `${GATEWAY_PREFIX}${BASE}/stream`;

/** An attachment's address through the gateway: the server fetches it from Meta for the signed-in team. */
export function mediaHref(path: string): string {
  return path.startsWith("/api/v1/") ? `${GATEWAY_PREFIX}${path}` : path;
}

// ─── The connection ──────────────────────────────────────────────────────

export async function fetchAccount() {
  return accountSchema.parse(await api.get<unknown>(`${BASE}/account`));
}

/** PUT: Meta checks the keys before they are kept; the token and secret never come back. */
export async function saveAccount(keys: Keys) {
  const body = {
    waba_id: keys.waba_id.trim(),
    phone_number_id: keys.phone_number_id.trim(),
    access_token: keys.access_token.trim(),
    app_secret: keys.app_secret.trim(),
    app_id: keys.app_id?.trim() || null,
  };
  return accountSchema.parse(await api.put<unknown>(`${BASE}/account`, body));
}

export async function verifyAccount() {
  return accountSchema.parse(await api.post<unknown>(`${BASE}/account/verify`));
}

export async function updateAccount(body: { routing?: boolean; retention_months?: number }) {
  return accountSchema.parse(await api.patch<unknown>(`${BASE}/account`, body));
}

/** DELETE: the keys are wiped. */
export async function disconnectAccount() {
  return accountSchema.parse(await api.del<unknown>(`${BASE}/account`));
}

export async function fetchOverview(days = 7) {
  return overviewSchema.parse(await api.get<unknown>(`${BASE}/overview`, { query: { days } }));
}

// ─── The inbox ───────────────────────────────────────────────────────────

/** A search as the server matches it: "@ananya" finds the username ananya. */
export function searchTerm(q: string | undefined): string | undefined {
  return q?.trim().replace(/^@/, "").trim() || undefined;
}

export async function fetchConversations(params: { filter: InboxFilter; q?: string; offset?: number; limit?: number }) {
  return conversationListSchema.parse(
    await api.get<unknown>(`${BASE}/conversations`, {
      query: { filter: params.filter, q: searchTerm(params.q), offset: params.offset ?? 0, limit: params.limit ?? 50 },
    }),
  );
}

export async function startConversation(registrationId: string) {
  return conversationSchema.parse(await api.post<unknown>(`${BASE}/conversations`, { registration_id: registrationId }));
}

export async function fetchMessages(conversationId: number, params: { before?: number; limit?: number } = {}) {
  return messageListSchema.parse(
    await api.get<unknown>(`${BASE}/conversations/${conversationId}/messages`, { query: { before: params.before, limit: params.limit ?? 50 } }),
  );
}

export type SendBody =
  | { type: "text"; text: string }
  | { type: "template"; template: string; language: string | null; params: { header?: string[]; body?: string[]; buttons?: Record<string, string> } };

export async function sendMessage(conversationId: number, body: SendBody) {
  return messageSchema.parse(await api.post<unknown>(`${BASE}/conversations/${conversationId}/messages`, body));
}

export async function markRead(conversationId: number) {
  return conversationSchema.parse(await api.post<unknown>(`${BASE}/conversations/${conversationId}/read`));
}

export async function setConversationStatus(conversationId: number, status: "open" | "closed") {
  return conversationSchema.parse(await api.patch<unknown>(`${BASE}/conversations/${conversationId}`, { status }));
}

// ─── Templates ───────────────────────────────────────────────────────────

/** `refresh: false` is what was last read from Meta (the composer's picker); true asks Meta. */
export async function fetchTemplates(refresh = true) {
  return templateListSchema.parse(await api.get<unknown>(`${BASE}/templates`, { query: { refresh } }));
}

export async function createTemplate(form: TemplateForm) {
  return templateListSchema.parse(await api.post<unknown>(`${BASE}/templates`, templateBody(form)));
}

export async function deleteTemplate(name: string, language?: string | null) {
  return templateListSchema.parse(
    await api.del<unknown>(`${BASE}/templates/${encodeURIComponent(name)}`, undefined, { query: { language: language || undefined } }),
  );
}

export async function installStandardTemplates() {
  return standardInstallSchema.parse(await api.post<unknown>(`${BASE}/templates/standard`));
}
