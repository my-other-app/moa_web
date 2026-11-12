import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";
import { mailClient } from "@moa/mail-ui";

import { handleCheckSchema, mailboxSchema, summarySchema } from "./schemas";

const BASE = "/api/v1/clubs/mailbox";

/** Where the browser opens the mailbox's stream: this app's gateway, which adds the session. */
export const MAIL_STREAM_URL = `${GATEWAY_PREFIX}${BASE}/stream`;

/** All of the club's mail as one mbox file (the club's own account). */
export const EXPORT_HREF = `${GATEWAY_PREFIX}${BASE}/export`;

// ─── The address and settings ────────────────────────────────────────────

export async function fetchMailbox() {
  return mailboxSchema.parse(await api.get<unknown>(BASE));
}

export async function checkHandle(handle: string) {
  return handleCheckSchema.parse(await api.get<unknown>(`${BASE}/handle-check`, { query: { handle } }));
}

/** Set the mailbox up at this handle, or change the address (the old one forwards 90 days). */
export async function saveAddress(handle: string) {
  return mailboxSchema.parse(await api.put<unknown>(`${BASE}/address`, { handle: handle.trim().toLowerCase() }));
}

export async function saveSettings(body: { display_name?: string; retention_months?: number }) {
  return mailboxSchema.parse(await api.patch<unknown>(`${BASE}/settings`, body));
}

export async function saveSignature(signature: string) {
  return mailboxSchema.parse(await api.put<unknown>(`${BASE}/signature`, { signature }));
}

/** DELETE /mail?confirm=DELETE: every thread and file, for good (the club's own account). */
export async function wipeMail() {
  return (await api.del<{ deleted_threads?: number }>(`${BASE}/mail`, undefined, { query: { confirm: "DELETE" } })) ?? {};
}

// ─── The mail: the same routes and screens as the platform's mailbox ─────

export async function fetchSummary() {
  return summarySchema.parse(await api.get<unknown>(`${BASE}/summary`));
}

/** The threads, their mail, sending and retrying: GET/POST/PATCH/DELETE under /clubs/mailbox (a window by offset). */
export const clubMail = mailClient(BASE);

/** New mail, a reply, a reply to all or a forward: always from the club's own address. The mail as kept (sent, or failed). */
export const sendMail = clubMail.sendMail;

export { fileHref, fetchFile, inlineImages, outgoingForm, type ComposeMode, type FetchFile, type Outgoing } from "@moa/mail-ui";
