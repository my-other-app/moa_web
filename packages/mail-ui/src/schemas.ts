import { z } from "zod";

/**
 * A mailbox's mail as the backend answers it, for any mailbox the
 * dashboards show: a club's own (app/api/club_mailbox) and the platform's
 * admin@, developer@, developers@ and info@ (app/api/platform_mail). The
 * threads, their mail and its files are the same shapes in both; the
 * platform's carry the address's local part (`mailbox`, e.g. "info").
 *
 * Everything here reads what it can and turns the rest into its empty form
 * (`.catch`), so a field the server adds or renames never fails a page.
 */

const str = z.string().nullish().default(null).catch(null);
const when = z.string().nullish().default(null).catch(null);
const count = z.coerce.number().catch(0);

/** What waits unread: the nav's badge, the folders' counts. */
export const summarySchema = z.object({
  unread_total: count,
  unread_threads: count,
  spam_unread: count,
  archive_unread: count,
});
export type MailSummary = z.infer<typeof summarySchema>;

export const FOLDERS = ["inbox", "sent", "archive", "spam"] as const;
export type Folder = (typeof FOLDERS)[number];
export const FOLDER_LABEL: Record<Folder, string> = { inbox: "Inbox", sent: "Sent", archive: "Archive", spam: "Spam" };

export const threadSchema = z.object({
  id: z.number(),
  folder: z.enum(["inbox", "sent", "archive", "spam"]).catch("inbox"),
  subject: z.string().catch(""),
  participants: z.array(z.string()).catch([]),
  message_count: count,
  unread_count: count,
  last_message_at: when,
  last_inbound_at: when,
  last_outbound_at: when,
  last_from: str,
  snippet: z.string().catch(""),
  has_attachments: z.boolean().catch(false),
  /** The platform's mailbox it belongs to ("info"); a club's threads have none. */
  mailbox: str,
});
export type MailThread = z.infer<typeof threadSchema>;

export const threadListSchema = z.object({
  items: z.array(threadSchema).catch([]),
  total: count,
  counts: summarySchema.catch({ unread_total: 0, unread_threads: 0, spam_unread: 0, archive_unread: 0 }),
});
export type ThreadList = z.infer<typeof threadListSchema>;

export const attachmentSchema = z.object({
  id: z.number(),
  filename: str,
  content_type: str,
  size_bytes: count,
  content_id: str,
  inline: z.boolean().catch(false),
  url: z.string(),
});
export type MailAttachment = z.infer<typeof attachmentSchema>;

export const MESSAGE_STATUSES = ["received", "sending", "sent", "failed", "bounced", "complained"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const messageSchema = z.object({
  id: z.number(),
  thread_id: z.number(),
  direction: z.enum(["in", "out"]).catch("in"),
  status: z.enum(MESSAGE_STATUSES).catch("received"),
  from_address: str,
  from_name: str,
  to: z.array(z.string()).catch([]),
  cc: z.array(z.string()).catch([]),
  bcc: z.array(z.string()).catch([]),
  reply_to: str,
  subject: z.string().catch(""),
  text: z.string().catch(""),
  /** Sanitised by the server; shown only in a sandboxed frame (MailHtml). */
  html: str,
  has_remote_images: z.boolean().catch(false),
  snippet: z.string().catch(""),
  unread: z.boolean().catch(false),
  spam: z.boolean().catch(false),
  delivered_to: str,
  sent_at: when,
  created_at: when,
  sent_by: str,
  error: str,
  attachments: z.array(attachmentSchema).catch([]),
  /** The platform's mailbox it came to or went from ("info"); a club's mail has none. */
  mailbox: str,
});
export type MailMessage = z.infer<typeof messageSchema>;

export const threadDetailSchema = z.object({
  thread: threadSchema,
  messages: z.array(messageSchema).catch([]),
  own_addresses: z.array(z.string()).catch([]),
});
export type ThreadDetail = z.infer<typeof threadDetailSchema>;

// ─── Refusals any mailbox can answer ─────────────────────────────────────

/** What each refusal means, when the server gave no sentence of its own. A mailbox adds its own (credits, plans). */
export const MAIL_ERROR_TEXT: Record<string, string> = {
  RECIPIENT_SUPPRESSED: "One of the addresses can't be mailed: it bounced or marked mail as spam before. Take it out to send.",
  ATTACHMENTS_TOO_LARGE: "Files can weigh 10 MB at most together.",
  INVALID_ADDRESS: "One of the addresses isn't an email address.",
  NO_RECIPIENTS: "Who is it to? Add an address in To.",
  TOO_MANY_RECIPIENTS: "That's too many people for one mail.",
  EMPTY_MAIL: "Write something first.",
  ATTACHMENT_GONE: "A file can't be read any more; send it without it.",
  NOT_FAILED: "Only mail that wasn't sent can be sent again.",
};

// ─── Small helpers ───────────────────────────────────────────────────────

const ADDRESS = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** "Ananya <a@x.in>, b@y.in" into ["a@x.in", "b@y.in"], each once, lower case. */
export function splitAddresses(value: string): string[] {
  const out: string[] = [];
  for (const raw of value.split(/[,;\n]/)) {
    const part = raw.trim();
    if (!part) continue;
    const angled = /<([^<>]+)>/.exec(part);
    const address = (angled ? angled[1]! : part).trim().toLowerCase();
    if (address && !out.includes(address)) out.push(address);
  }
  return out;
}

export function isAddress(value: string): boolean {
  return ADDRESS.test(value);
}

/** "Re: Parking?" once, however many times it is answered. */
export function replySubject(subject: string, mode: "reply" | "reply_all" | "forward"): string {
  const s = subject.trim();
  if (mode === "forward") return /^\s*(fwd?|fw)\s*:/i.test(s) ? s : `Fwd: ${s}`.trim();
  return /^\s*re\s*:/i.test(s) ? s : `Re: ${s}`.trim();
}

/**
 * Who sent it, for a person: their name, else their address. Mail the
 * mailbox sent says who on the team wrote it, and whose mailbox it is
 * (`ours`: "the club", "MyOtherApp").
 */
export function senderName(m: Pick<MailMessage, "direction" | "from_name" | "from_address" | "sent_by">, ours = "the club"): string {
  if (m.direction === "out") return m.sent_by ? `${m.sent_by} (${ours})` : ours.charAt(0).toUpperCase() + ours.slice(1);
  return m.from_name || m.from_address || "Someone";
}

export function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words[words.length - 1]![0]}`).toUpperCase();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** What may be attached to one mail, together. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** A text mail's lines, the quoted ones (">") grouped so they can fold away. */
export function textBlocks(text: string): { quoted: boolean; lines: string[] }[] {
  const out: { quoted: boolean; lines: string[] }[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const quoted = line.trimStart().startsWith(">");
    const last = out[out.length - 1];
    if (last && last.quoted === quoted) last.lines.push(line);
    else out.push({ quoted, lines: [line] });
  }
  return out;
}

// ─── Showing a mail's HTML safely ────────────────────────────────────────

/** Nothing loads from anywhere: no picture from elsewhere, no font, no script (the frame has none anyway). */
export const CSP_BLOCKED = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
/** After "Show images": pictures from the web too, nothing else. */
export const CSP_IMAGES = "default-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:";
/** The frame may open a link in a new tab (out of the sandbox), and nothing more: no scripts, no same origin, no forms. */
export const FRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

/**
 * The document the frame shows: the server's sanitised HTML under a
 * Content-Security-Policy of its own, links opening in a new tab.
 */
export function srcdocFor(html: string, showImages: boolean): string {
  const csp = showImages ? CSP_IMAGES : CSP_BLOCKED;
  return [
    "<!doctype html><html><head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<meta name="referrer" content="no-referrer">',
    '<base target="_blank">',
    "<style>html,body{margin:0;padding:0}body{padding:12px;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2933;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style>",
    "</head><body>",
    html,
    "</body></html>",
  ].join("");
}

/** A picture the mail carries, shown inline only up to this size (it goes into the frame as a data: address). */
export const INLINE_IMAGE_MAX = 2 * 1024 * 1024;

const CID_SRC = /(\ssrc\s*=\s*)(["']?)cid:([^"'\s>]+)\2/gi;

/** The Content-IDs the HTML shows by `cid:`. */
export function cidsIn(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(CID_SRC)) {
    const id = decodeURIComponent(m[3]!).replace(/^<|>$/g, "");
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** The HTML with each `cid:` picture it has a data: address for put in place (the rest left as they are, so blocked). */
export function withInlineImages(html: string, dataUrls: Record<string, string>): string {
  return html.replace(CID_SRC, (whole, prefix: string, _quote: string, raw: string) => {
    const id = decodeURIComponent(raw).replace(/^<|>$/g, "");
    const url = dataUrls[id];
    return url ? `${prefix}"${url}"` : whole;
  });
}
