import { api } from "@moa/app-kit";
import { ApiError, toApiError } from "@moa/api";
import { GATEWAY_PREFIX } from "@moa/auth";

import {
  accountSchema,
  conversationListSchema,
  conversationSchema,
  inboxSettingsSchema,
  messageListSchema,
  messageSchema,
  myNotificationsSchema,
  noteListSchema,
  noteSchema,
  overviewSchema,
  savedReplyListSchema,
  savedReplySchema,
  standardInstallSchema,
  summarySchema,
  teamSchema,
  templateBody,
  templateListSchema,
  type InboxFilter,
  type Keys,
  type MyNotifications,
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

/** Routing, retention, or just the app ID (checked with Meta to be the token's own app). */
export async function updateAccount(body: { routing?: boolean; retention_months?: number; app_id?: string }) {
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

export async function fetchConversations(params: { filter: InboxFilter; q?: string; assignee?: string | null; offset?: number; limit?: number }) {
  return conversationListSchema.parse(
    await api.get<unknown>(`${BASE}/conversations`, {
      query: { filter: params.filter, q: searchTerm(params.q), assignee: params.assignee || undefined, offset: params.offset ?? 0, limit: params.limit ?? 50 },
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
  | { type: "text"; text: string; reply_to?: number | null }
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

// ─── The inbox as a team's ───────────────────────────────────────────────

export async function fetchSummary() {
  return summarySchema.parse(await api.get<unknown>(`${BASE}/summary`));
}

export async function fetchTeam() {
  return teamSchema.parse(await api.get<unknown>(`${BASE}/team`));
}

export async function fetchInboxSettings() {
  return inboxSettingsSchema.parse(await api.get<unknown>(`${BASE}/inbox-settings`));
}

export async function updateInboxSettings(body: { alert_after_hours?: number; stop_reply?: string; start_reply?: string }) {
  return inboxSettingsSchema.parse(await api.patch<unknown>(`${BASE}/inbox-settings`, body));
}

export async function updateMyNotifications(body: Partial<MyNotifications>) {
  return myNotificationsSchema.parse(await api.patch<unknown>(`${BASE}/inbox-settings/me`, body));
}

/** The owner (`owner`), a member (`member_id`), or nobody (neither). */
export async function assignConversation(conversationId: number, to: { owner?: boolean; member_id?: number | null }) {
  return conversationSchema.parse(await api.put<unknown>(`${BASE}/conversations/${conversationId}/assignee`, to));
}

/** At WhatsApp too, or (`localOnly`) here alone. */
export async function blockConversation(conversationId: number, localOnly = false) {
  return conversationSchema.parse(await api.post<unknown>(`${BASE}/conversations/${conversationId}/block`, { local_only: localOnly }));
}

export async function unblockConversation(conversationId: number, localOnly = false) {
  return conversationSchema.parse(
    await api.del<unknown>(`${BASE}/conversations/${conversationId}/block`, undefined, { query: { local_only: localOnly || undefined } }),
  );
}

export async function optOutConversation(conversationId: number, scope: "all" | "marketing" = "all") {
  return conversationSchema.parse(await api.post<unknown>(`${BASE}/conversations/${conversationId}/optout`, { scope }));
}

export async function optInConversation(conversationId: number, scope: "all" | "marketing" = "all") {
  return conversationSchema.parse(await api.del<unknown>(`${BASE}/conversations/${conversationId}/optout`, undefined, { query: { scope } }));
}

export async function fetchNotes(conversationId: number) {
  return noteListSchema.parse(await api.get<unknown>(`${BASE}/conversations/${conversationId}/notes`));
}

export async function addNote(conversationId: number, body: string) {
  return noteSchema.parse(await api.post<unknown>(`${BASE}/conversations/${conversationId}/notes`, { body }));
}

export async function deleteNote(conversationId: number, noteId: number) {
  return noteListSchema.parse(await api.del<unknown>(`${BASE}/conversations/${conversationId}/notes/${noteId}`));
}

export async function fetchSavedReplies() {
  return savedReplyListSchema.parse(await api.get<unknown>(`${BASE}/saved-replies`));
}

export type SavedReplyBody = { title: string; body: string; shortcut?: string | null };

export async function createSavedReply(body: SavedReplyBody) {
  return savedReplySchema.parse(await api.post<unknown>(`${BASE}/saved-replies`, body));
}

export async function updateSavedReply(id: number, body: SavedReplyBody) {
  return savedReplySchema.parse(await api.put<unknown>(`${BASE}/saved-replies/${id}`, body));
}

export async function deleteSavedReply(id: number) {
  return savedReplyListSchema.parse(await api.del<unknown>(`${BASE}/saved-replies/${id}`));
}

/** Where a file goes: through the gateway, as every call does, to the server that streams it on to Meta. */
export const mediaUploadUrl = (conversationId: number) => `${GATEWAY_PREFIX}${BASE}/conversations/${conversationId}/media`;

export interface UploadOptions {
  caption?: string | null;
  replyTo?: number | null;
  /** 0 to 1, as the bytes leave the browser. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Tests stand in for XMLHttpRequest. */
  makeRequest?: () => XMLHttpRequest;
}

/**
 * A photo, video, sound or document, sent to them: multipart with its `size`
 * first (the server needs it before the file to stream it on), then the
 * caption and the message it answers, then the file. XMLHttpRequest rather
 * than fetch, for the upload's progress. The message as kept, or the
 * server's refusal as an ApiError.
 */
export function uploadMedia(conversationId: number, file: File, options: UploadOptions = {}): Promise<ReturnType<typeof messageSchema.parse>> {
  const form = new FormData();
  form.append("size", String(file.size));
  if (options.caption?.trim()) form.append("caption", options.caption.trim());
  if (options.replyTo) form.append("reply_to", String(options.replyTo));
  form.append("file", file, file.name);
  return new Promise((resolve, reject) => {
    const xhr = options.makeRequest ? options.makeRequest() : new XMLHttpRequest();
    xhr.open("POST", mediaUploadUrl(conversationId));
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) options.onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(messageSchema.parse(JSON.parse(xhr.responseText || "{}")));
        } catch (error) {
          reject(error);
        }
        return;
      }
      reject(await toApiError(new Response(xhr.responseText || null, { status: xhr.status, headers: { "content-type": "application/json" } })));
    };
    xhr.onerror = () => reject(new ApiError({ message: "The file couldn't be sent. Check your connection and try again.", status: 0 }));
    xhr.onabort = () => reject(new ApiError({ message: "Cancelled.", status: 0, errorCode: "CANCELLED" }));
    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
