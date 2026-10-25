import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import {
  INLINE_IMAGE_MAX,
  handleCheckSchema,
  mailboxSchema,
  messageSchema,
  summarySchema,
  threadDetailSchema,
  threadListSchema,
  threadSchema,
  type Folder,
  type MailAttachment,
} from "./schemas";

const BASE = "/api/v1/clubs/mailbox";

/** Where the browser opens the mailbox's stream: this app's gateway, which adds the session. */
export const MAIL_STREAM_URL = `${GATEWAY_PREFIX}${BASE}/stream`;

/** A file's address through the gateway: the API serves it to the signed-in team only. */
export function fileHref(path: string): string {
  return path.startsWith("/api/v1/") ? `${GATEWAY_PREFIX}${path}` : path;
}

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

// ─── The mail ────────────────────────────────────────────────────────────

export async function fetchSummary() {
  return summarySchema.parse(await api.get<unknown>(`${BASE}/summary`));
}

export async function fetchThreads(params: { folder: Folder; q?: string; unread?: boolean; offset?: number; limit?: number }) {
  return threadListSchema.parse(
    await api.get<unknown>(`${BASE}/threads`, {
      query: {
        folder: params.folder,
        q: params.q?.trim() || undefined,
        unread: params.unread || undefined,
        offset: params.offset ?? 0,
        limit: params.limit ?? 30,
      },
    }),
  );
}

export async function fetchThread(threadId: number) {
  return threadDetailSchema.parse(await api.get<unknown>(`${BASE}/threads/${threadId}`));
}

export async function markThreadRead(threadId: number) {
  return threadSchema.parse(await api.post<unknown>(`${BASE}/threads/${threadId}/read`));
}

export async function markThreadUnread(threadId: number) {
  return threadSchema.parse(await api.post<unknown>(`${BASE}/threads/${threadId}/unread`));
}

export async function moveThread(threadId: number, folder: "inbox" | "archive" | "spam") {
  return threadSchema.parse(await api.patch<unknown>(`${BASE}/threads/${threadId}`, { folder }));
}

export async function deleteThread(threadId: number) {
  return (await api.del<{ deleted?: number }>(`${BASE}/threads/${threadId}`)) ?? {};
}

export type ComposeMode = "new" | "reply" | "reply_all" | "forward";

export interface Outgoing {
  mode: ComposeMode;
  /** The mail answered or forwarded. */
  messageId?: number | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  includeSignature: boolean;
  /** The original's files sent on (a forward). */
  forwardAttachments: number[];
  files: File[];
}

/** The multipart body POST /messages reads: its field names exactly. */
export function outgoingForm(o: Outgoing): FormData {
  const form = new FormData();
  form.append("mode", o.mode);
  if (o.messageId) form.append("message_id", String(o.messageId));
  form.append("to", o.to.join(", "));
  if (o.cc.length) form.append("cc", o.cc.join(", "));
  if (o.bcc.length) form.append("bcc", o.bcc.join(", "));
  form.append("subject", o.subject);
  form.append("text", o.text);
  form.append("include_signature", o.includeSignature ? "true" : "false");
  if (o.forwardAttachments.length) form.append("forward_attachments", o.forwardAttachments.join(","));
  for (const f of o.files) form.append("files", f, f.name);
  return form;
}

/** New mail, a reply, a reply to all, or a forward: always from the club's own address. The mail as kept (sent, or failed). */
export async function sendMail(o: Outgoing) {
  return messageSchema.parse(await api.post<unknown>(`${BASE}/messages`, outgoingForm(o)));
}

export async function retryMail(messageId: number) {
  return messageSchema.parse(await api.post<unknown>(`${BASE}/messages/${messageId}/retry`));
}

// ─── Pictures the mail carries ───────────────────────────────────────────

export type FetchFile = (href: string) => Promise<Blob | null>;

/** A file through the gateway, with the session's cookie. */
export const fetchFile: FetchFile = async (href) => {
  const res = await fetch(href, { credentials: "include" });
  return res.ok ? await res.blob() : null;
};

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const PICTURES = /^image\/(png|jpe?g|gif|webp)$/i;

/**
 * The pictures the HTML shows by `cid:`, each read through the gateway and
 * made a data: address (the frame has an opaque origin and no cookie, so it
 * cannot fetch them itself). Only plain picture types, each at most
 * INLINE_IMAGE_MAX; any that can't be read stays blocked.
 */
export async function inlineImages(cids: string[], attachments: MailAttachment[], read: FetchFile = fetchFile): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const cid of cids) {
    const a = attachments.find((x) => x.content_id === cid);
    if (!a || a.size_bytes > INLINE_IMAGE_MAX || !PICTURES.test(a.content_type ?? "")) continue;
    try {
      const blob = await read(fileHref(a.url));
      if (blob && blob.size <= INLINE_IMAGE_MAX) {
        const url = await asDataUrl(blob.type ? blob : new Blob([blob], { type: a.content_type ?? "image/png" }));
        if (/^data:image\/(png|jpe?g|gif|webp)[;,]/i.test(url)) out[cid] = url;
      }
    } catch {
      // One picture that can't be read stays blocked; the mail is still shown.
    }
  }
  return out;
}
