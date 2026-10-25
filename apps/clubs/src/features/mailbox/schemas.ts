import { z } from "zod";

/**
 * The club's mailbox, as the backend answers it (app/api/club_mailbox):
 * one address on the platform's domain, `<handle>@mail.myotherapp.in`, its
 * mail received into the dashboard, answered and written from it.
 *
 * Everything here reads what it can and turns the rest into its empty form
 * (`.catch`), so a field the server adds or renames never fails a page.
 */

const str = z.string().nullish().default(null).catch(null);
const when = z.string().nullish().default(null).catch(null);
const count = z.coerce.number().catch(0);

export const upgradeSchema = z
  .object({
    feature: z.string().nullish().catch(null),
    label: z.string().nullish().catch(null),
    required_plan: z.string().nullish().catch(null),
    required_plan_name: z.string().nullish().catch(null),
    upgrade_url: z.string().nullish().catch(null),
  })
  .nullish()
  .catch(null);
export type Upgrade = z.infer<typeof upgradeSchema>;

export const STATES = ["open", "lapsed", "expired"] as const;
export type MailboxState = (typeof STATES)[number];

/** GET /clubs/mailbox: whether it is open here, the address, what the plan allows, what the viewer may do. Never a mail. */
export const mailboxSchema = z.object({
  /** False for a server without the routes (route-level 404): the section stays hidden. */
  on_server: z.boolean().catch(true).default(true),
  /** The feature switch on that server (APP_CLUB_MAILBOX). */
  available: z.boolean().catch(false),
  domain: z.string().catch("mail.myotherapp.in"),
  plan_allows: z.boolean().catch(true),
  upgrade: upgradeSchema,
  set_up: z.boolean().catch(false),
  address: str,
  handle: str,
  previous: z.array(z.object({ address: z.string(), forward_until: when })).catch([]),
  display_name: str,
  signature: str,
  retention_months: z.coerce.number().catch(12),
  next_change_at: when,
  state: z.enum(STATES).catch("open"),
  lapsed_at: when,
  readable_until: when,
  can_manage: z.boolean().catch(false),
  can_mail: z.boolean().catch(false),
  is_owner: z.boolean().catch(false),
  impersonated: z.boolean().catch(false),
  credits_left: z.coerce.number().nullable().catch(null),
  limits: z
    .object({ per_hour: count, per_day: count, recipients: count, attachments_mb: z.coerce.number().catch(10) })
    .catch({ per_hour: 60, per_day: 300, recipients: 50, attachments_mb: 10 }),
});
export type Mailbox = z.infer<typeof mailboxSchema>;

export const handleCheckSchema = z.object({
  handle: z.string(),
  address: z.string().catch(""),
  available: z.boolean().catch(false),
  code: str,
  message: str,
});
export type HandleCheck = z.infer<typeof handleCheckSchema>;

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
});
export type MailMessage = z.infer<typeof messageSchema>;

export const threadDetailSchema = z.object({
  thread: threadSchema,
  messages: z.array(messageSchema).catch([]),
  own_addresses: z.array(z.string()).catch([]),
});
export type ThreadDetail = z.infer<typeof threadDetailSchema>;

// ─── Refusals ────────────────────────────────────────────────────────────

export const MAILBOX_PRIVATE = "MAILBOX_PRIVATE";
export const MAILBOX_PERMISSION = "MAILBOX_PERMISSION";
export const MAILBOX_LAPSED = "MAILBOX_LAPSED";
export const NO_EMAIL_CREDITS = "NO_EMAIL_CREDITS";
export const PRIVATE_MESSAGE = "A club's mail is for its own team. Acting as the club, you can see whether its mailbox is set up, not its mail.";
export const PERMISSION_MESSAGE = "You need the Mail permission to see the club's mail. Ask the club's owner.";
export const BUY_CREDITS = "You're out of email credits. Buy more email credits to send from the club's mailbox.";

/** What each refusal means, when the server gave no sentence of its own. */
export const ERROR_TEXT: Record<string, string> = {
  NO_EMAIL_CREDITS: BUY_CREDITS,
  MAILBOX_RATE_LIMITED: "The club's mailbox has sent as much as it may for now. Try again later.",
  RECIPIENT_SUPPRESSED: "One of the addresses can't be mailed: it bounced or marked mail as spam before. Take it out to send.",
  ATTACHMENTS_TOO_LARGE: "Files can weigh 10 MB at most together.",
  INVALID_ADDRESS: "One of the addresses isn't an email address.",
  NO_RECIPIENTS: "Who is it to? Add an address in To.",
  TOO_MANY_RECIPIENTS: "That's too many people for one mail.",
  EMPTY_MAIL: "Write something first.",
  PLAN_FEATURE_LOCKED: "The club mailbox is part of Pro and Enterprise.",
  MAILBOX_LAPSED: "Your plan no longer includes the mailbox and its 30 days are over. The club's owner can export the mail, or delete it, from Mail settings.",
  MAILBOX_PRIVATE: PRIVATE_MESSAGE,
  MAILBOX_PERMISSION: PERMISSION_MESSAGE,
  MAILBOX_OFF: "Club mailboxes aren't open yet.",
  NO_MAILBOX: "Pick the club's address first, in Mail settings.",
  ATTACHMENT_GONE: "A file can't be read any more; send it without it.",
  HANDLE_INVALID: "Use 3 to 30 letters, numbers, dots and hyphens, starting and ending with a letter or a number.",
  HANDLE_RESERVED: "That address is kept for the platform. Pick another.",
  HANDLE_TAKEN: "That address is taken. Pick another.",
  HANDLE_CHANGED_RECENTLY: "The address can change once a month.",
  NOT_FAILED: "Only mail that wasn't sent can be sent again.",
  CONFIRM_DELETE: "Type DELETE to delete all of the mail.",
  OWNER_ONLY: "Only the club's own account can export or delete all of its mail.",
};

// ─── Small helpers ───────────────────────────────────────────────────────

/** The handle's rules, as the server holds them (app/api/club_mailbox/handles.py), for a hint before asking. */
export const HANDLE_RULE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

export function handleProblem(value: string): string | null {
  const h = value.trim().toLowerCase();
  if (!h) return null;
  if (h.length < 3 || h.length > 30) return "An address is 3 to 30 characters.";
  if (!HANDLE_RULE.test(h)) return "Use letters, numbers, dots and hyphens, starting and ending with a letter or a number.";
  if (/[.-]{2}/.test(h)) return "No two dots or hyphens in a row.";
  return null;
}

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

/** Who sent it, for a person: their name, else their address. */
export function senderName(m: Pick<MailMessage, "direction" | "from_name" | "from_address" | "sent_by">): string {
  if (m.direction === "out") return m.sent_by ? `${m.sent_by} (the club)` : "The club";
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
