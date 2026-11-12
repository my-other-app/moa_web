import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import {
  INLINE_IMAGE_MAX,
  messageSchema,
  threadDetailSchema,
  threadListSchema,
  threadSchema,
  type Folder,
  type MailAttachment,
  type MailMessage,
  type MailThread,
  type ThreadDetail,
  type ThreadList,
} from "./schemas";

/** A file's address through the app's gateway: the API serves it to the signed-in team only. */
export function fileHref(path: string): string {
  return path.startsWith("/api/v1/") ? `${GATEWAY_PREFIX}${path}` : path;
}

export type ComposeMode = "new" | "reply" | "reply_all" | "forward";

export interface Outgoing {
  mode: ComposeMode;
  /** The mail answered or forwarded. */
  messageId?: number | null;
  /** Its conversation (the platform's form reads it; a club's ignores it). */
  threadId?: number | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  /** Left out where the mailbox has no signature. */
  includeSignature?: boolean;
  /** The original's files sent on (a forward). */
  forwardAttachments: number[];
  files: File[];
  /** Which of the platform's addresses it is from ("info"); a club's mail is always from its own. */
  fromMailbox?: string | null;
}

/** The multipart body POST …/messages reads: its field names exactly. */
export function outgoingForm(o: Outgoing): FormData {
  const form = new FormData();
  form.append("mode", o.mode);
  if (o.messageId) form.append("message_id", String(o.messageId));
  if (o.threadId) form.append("thread_id", String(o.threadId));
  form.append("to", o.to.join(", "));
  if (o.cc.length) form.append("cc", o.cc.join(", "));
  if (o.bcc.length) form.append("bcc", o.bcc.join(", "));
  form.append("subject", o.subject);
  form.append("text", o.text);
  if (o.includeSignature !== undefined) form.append("include_signature", o.includeSignature ? "true" : "false");
  if (o.forwardAttachments.length) form.append("forward_attachments", o.forwardAttachments.join(","));
  if (o.fromMailbox) form.append("from_mailbox", o.fromMailbox);
  for (const f of o.files) form.append("files", f, f.name);
  return form;
}

/** A list's query string, as the API client takes it. */
export type ListQuery = Record<string, string | number | boolean | null | undefined>;

/** A page of a folder: what the list asks for. */
export interface ThreadQuery {
  folder: Folder;
  q?: string;
  unread?: boolean;
  /** One of the platform's mailboxes ("info"), or all of them. */
  mailbox?: string | null;
  offset?: number;
  limit?: number;
}

/** Everything a mailbox's screens ask of its API. */
export interface MailClient {
  fetchThreads(params: ThreadQuery): Promise<ThreadList>;
  fetchThread(threadId: number): Promise<ThreadDetail>;
  markRead(threadId: number): Promise<MailThread>;
  markUnread(threadId: number): Promise<MailThread>;
  moveThread(threadId: number, folder: "inbox" | "archive" | "spam"): Promise<MailThread>;
  deleteThread(threadId: number): Promise<{ deleted?: number }>;
  /** New mail, a reply, a reply to all or a forward: the mail as kept (sent, or failed). */
  sendMail(o: Outgoing): Promise<MailMessage>;
  retryMail(messageId: number): Promise<MailMessage>;
}

/** A club's list query: a window by offset (GET /clubs/mailbox/threads). */
export function offsetQuery(p: ThreadQuery): ListQuery {
  return {
    folder: p.folder,
    q: p.q?.trim() || undefined,
    unread: p.unread || undefined,
    offset: p.offset ?? 0,
    limit: p.limit ?? 30,
  };
}

/**
 * The routes under `base` (…/threads, …/threads/{id}, …/messages): the same
 * for a club's mailbox and the platform's. `listQuery` shapes the list's
 * query when an API pages it differently.
 */
export function mailClient(base: string, options: { listQuery?: (p: ThreadQuery) => ListQuery } = {}): MailClient {
  const listQuery = options.listQuery ?? offsetQuery;
  return {
    fetchThreads: async (params) => threadListSchema.parse(await api.get<unknown>(`${base}/threads`, { query: listQuery(params) })),
    fetchThread: async (threadId) => threadDetailSchema.parse(await api.get<unknown>(`${base}/threads/${threadId}`)),
    markRead: async (threadId) => threadSchema.parse(await api.post<unknown>(`${base}/threads/${threadId}/read`)),
    markUnread: async (threadId) => threadSchema.parse(await api.post<unknown>(`${base}/threads/${threadId}/unread`)),
    moveThread: async (threadId, folder) => threadSchema.parse(await api.patch<unknown>(`${base}/threads/${threadId}`, { folder })),
    deleteThread: async (threadId) => (await api.del<{ deleted?: number }>(`${base}/threads/${threadId}`)) ?? {},
    sendMail: async (o) => messageSchema.parse(await api.post<unknown>(`${base}/messages`, outgoingForm(o))),
    retryMail: async (messageId) => messageSchema.parse(await api.post<unknown>(`${base}/messages/${messageId}/retry`)),
  };
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
