import { z } from "zod";

import { personRefSchema, words } from "@/features/teamwork";

/**
 * Support cases (support-leads-contract.md): one question from one person,
 * with its whole conversation, whoever answers it.
 */
export const CASE_STATUSES = ["new", "open", "waiting", "resolved", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const STATUS_LABEL: Record<CaseStatus, string> = { new: "New", open: "Open", waiting: "Waiting on them", resolved: "Resolved", closed: "Closed" };
export const STATUS_TONE: Record<CaseStatus, "default" | "info" | "warning" | "success"> = { new: "info", open: "info", waiting: "warning", resolved: "success", closed: "default" };
export const statusLabel = (s: string) => (STATUS_LABEL as Record<string, string>)[s] ?? words(s);
export const statusTone = (s: string) => (STATUS_TONE as Record<string, "default" | "info" | "warning" | "success">)[s] ?? "default";

export const CASE_TABS = ["mine", "unassigned", "open", "waiting", "resolved", "all"] as const;
export type CaseTab = (typeof CASE_TABS)[number];
export const TAB_LABEL: Record<CaseTab, string> = { mine: "Mine", unassigned: "Unassigned", open: "All open", waiting: "Waiting on them", resolved: "Resolved", all: "All" };

export const CHANNEL_LABEL: Record<string, string> = { app: "App", web: "Website", dashboard: "Club dashboard", email: "Email", manual: "Logged by hand" };
export const channelLabel = (c: string) => CHANNEL_LABEL[c] ?? words(c);

export const FLAG_LABEL: Record<string, string> = { unknown_sender: "Unknown sender", not_delivered: "Not delivered", spam: "Spam" };
export const flagLabel = (f: string) => FLAG_LABEL[f] ?? words(f);

const id = z.coerce.number();
const text = z.string().nullish().transform((v) => v ?? "");
/** A record's id: a number for most, a string for a Razorpay payment. */
const anyId = z.union([z.number(), z.string()]).nullish();

export const requesterSchema = z.object({
  kind: z.string().catch("guest"),
  id: id.nullish(),
  name: z.string().nullish(),
  email: z.string().nullish(),
});
export type Requester = z.infer<typeof requesterSchema>;

export const caseRowSchema = z.object({
  id,
  number: id,
  subject: text,
  status: z.string().catch("open"),
  priority: z.string().catch("normal"),
  topic: z.string().nullish(),
  channel: z.string().catch("web"),
  requester: requesterSchema.catch({ kind: "guest", id: null, name: null, email: null }),
  assignee: personRefSchema.nullish(),
  tags: z.array(z.string()).catch([]),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  first_reply_due: z.string().nullish(),
  resolution_due: z.string().nullish(),
  overdue: z.boolean().catch(false),
  flags: z.array(z.string()).catch([]),
});
export type CaseRow = z.infer<typeof caseRowSchema>;

export const caseCountsSchema = z.object({
  mine: z.coerce.number().catch(0),
  unassigned: z.coerce.number().catch(0),
  open: z.coerce.number().catch(0),
  waiting: z.coerce.number().catch(0),
  resolved: z.coerce.number().catch(0),
});
export type CaseCounts = z.infer<typeof caseCountsSchema>;

export const casePageSchema = z.object({
  items: z.array(caseRowSchema),
  total: z.coerce.number().catch(0),
  counts: caseCountsSchema.catch({ mine: 0, unassigned: 0, open: 0, waiting: 0, resolved: 0 }),
});
export type CasePage = z.infer<typeof casePageSchema>;

export const attachmentSchema = z.object({ name: z.string().nullish().transform((v) => v ?? "file"), url: z.string().nullish(), size: z.coerce.number().nullish() });

/**
 * Files sent with a reply or a note (support-leads contract, Changes): each
 * uploaded first, one a call, to POST /admin/support/cases/{id}/attachments
 * (multipart `file`, any kind, 10 MB at most), which answers its `key`; the
 * keys then go in the message's `attachments`. A key works for a day, once,
 * and only for the admin who uploaded it. Ten files a message at most.
 */
export const REPLY_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const REPLY_FILES_MAX = 10;
export const uploadedFileSchema = z.object({ key: z.string().min(1), name: z.string().nullish(), size: z.coerce.number().nullish() });

/** "2.4 MB", "830 KB": a file's size as the reply box shows it. */
export function fileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Where an attachment opens: an API path goes through the gateway (the
 * session cookie goes with it), a signed https link as it is, anything else
 * not at all.
 */
export function attachmentHref(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/v1/")) return `/api/gateway${url}`;
  if (url.startsWith("https://")) return url;
  return null;
}

export const MESSAGE_KINDS = ["reply_in", "reply_out", "note", "system"] as const;

export const messageSchema = z.object({
  id,
  kind: z.string().catch("system"),
  /** Null for an admin outside both teams: the API sends no bodies to them. */
  body_text: z.string().nullish(),
  body_html: z.string().nullish(),
  author_name: z.string().nullish(),
  created_at: z.string().nullish(),
  attachments: z.array(attachmentSchema).catch([]),
  /** sending, sent, failed, bounced, complained: for a reply that went by email. */
  delivery_status: z.string().nullish(),
  delivery_error: z.string().nullish(),
});
export type CaseMessage = z.infer<typeof messageSchema>;

export const caseLinksSchema = z
  .object({ user_id: anyId, club_id: anyId, event_id: anyId, registration_id: anyId, payment_id: anyId, refund_id: anyId, dispute_id: anyId })
  .partial()
  .catch({});
export type CaseLinks = z.infer<typeof caseLinksSchema>;

/** One row of the linked-records panel; it names the admin page that opens it. */
export const panelItemSchema = z
  .object({
    id: anyId,
    title: z.string().nullish(),
    name: z.string().nullish(),
    label: z.string().nullish(),
    subtitle: z.string().nullish(),
    status: z.string().nullish(),
    amount: z.coerce.number().nullish(),
    at: z.string().nullish(),
    created_at: z.string().nullish(),
    path: z.string().nullish(),
    admin_path: z.string().nullish(),
  })
  .passthrough();
export type PanelItem = z.infer<typeof panelItemSchema>;

export const panelSchema = z.record(z.unknown()).nullish().catch(null);

export const caseDetailSchema = caseRowSchema.extend({
  messages: z.array(messageSchema).catch([]),
  links: caseLinksSchema,
  panel: panelSchema,
  survey: z.object({ solved: z.boolean().nullish(), comment: z.string().nullish(), answered_at: z.string().nullish() }).nullish(),
  merged_into_id: id.nullish(),
  parent_case_id: id.nullish(),
  lead_id: id.nullish(),
  /** The server's own word on the signed-in admin: read the words, work the case, take it. */
  reads_bodies: z.boolean().nullish(),
  can_work: z.boolean().nullish(),
  can_take: z.boolean().nullish(),
  purged_at: z.string().nullish(),
});
export type CaseDetail = z.infer<typeof caseDetailSchema>;

/** What a preview of a reply answers: the email as it will go. */
export const previewSchema = z
  .object({
    subject: z.string().nullish(),
    will_push: z.boolean().nullish(),
    html: z.string().nullish(),
    body_html: z.string().nullish(),
    text: z.string().nullish(),
    body_text: z.string().nullish(),
    to: z.union([z.string(), z.array(z.string())]).nullish(),
  })
  .passthrough()
  .transform((p) => ({ subject: p.subject ?? null, html: p.html ?? p.body_html ?? null, text: p.text ?? p.body_text ?? null, to: Array.isArray(p.to) ? p.to.join(", ") : (p.to ?? null), willPush: Boolean(p.will_push) }));
export type ReplyPreview = z.infer<typeof previewSchema>;

/** The panel's sections in the order a support person reads them, with their headings. */
export const PANEL_SECTIONS: { key: string; label: string }[] = [
  { key: "club", label: "The club" },
  { key: "registrations", label: "Registrations and tickets" },
  { key: "tickets", label: "Tickets" },
  { key: "payments", label: "Payments" },
  { key: "refunds", label: "Refunds" },
  { key: "disputes", label: "Disputes" },
  { key: "clubs", label: "Clubs they run" },
];

/** The rows of one panel section, read leniently; anything without a name is skipped. */
export function panelItems(panel: Record<string, unknown> | null | undefined, key: string): PanelItem[] {
  const value = panel?.[key];
  const raw = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return raw.flatMap((r) => {
    const parsed = panelItemSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** A panel row's name: its title, the event, the receipt or the Razorpay id, whatever it has. */
export const itemName = (i: PanelItem) =>
  i.title ?? i.name ?? i.label ?? str(i.event_name) ?? str(i.receipt) ?? str(i.razorpay_payment_id) ?? str(i.reason) ?? (i.id !== null && i.id !== undefined ? `#${i.id}` : "—");

/** A panel row's amount in rupees: amount, the paid amount, or paise. */
export function itemAmount(i: PanelItem): number | null {
  if (typeof i.amount === "number") return i.amount;
  if (typeof i.paid_amount === "number" && i.paid_amount > 0) return i.paid_amount;
  if (typeof i.amount_paise === "number") return i.amount_paise / 100;
  return null;
}

/** A panel row's status, in the words the row carries it. */
export function itemStatus(i: PanelItem): string | null {
  if (i.status) return i.status;
  if (i.ticket_revoked === true) return "ticket_revoked";
  if (i.attended === true) return "attended";
  return str(i.payment_status) ?? str(i.role) ?? str(i.kind);
}

/** Only the portal's own pages: a path the API gives must start with one slash, never a scheme or "//". */
export function safePath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

/** The admin pages a case's links open. */
export function linkTargets(links: CaseLinks): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  if (links.user_id) out.push({ label: `User ${links.user_id}`, href: `/users/${links.user_id}` });
  if (links.club_id) out.push({ label: `Club ${links.club_id}`, href: `/clubs/${links.club_id}` });
  if (links.event_id) out.push({ label: `Event ${links.event_id}`, href: `/events/${links.event_id}` });
  if (links.payment_id) out.push({ label: `Payment ${links.payment_id}`, href: `/payments?q=${encodeURIComponent(String(links.payment_id))}` });
  if (links.refund_id) out.push({ label: `Refund ${links.refund_id}`, href: `/payments?q=${encodeURIComponent(String(links.refund_id))}` });
  if (links.dispute_id) out.push({ label: `Dispute ${links.dispute_id}`, href: `/disputes` });
  return out;
}

/** "Riya (riya@x.in)", "a guest", "Circuit Society": who wrote in. */
export function requesterLabel(r: Requester): string {
  if (r.name && r.email) return `${r.name} (${r.email})`;
  return r.name ?? r.email ?? (r.kind === "club" ? "A club" : "A guest");
}

export const REQUESTER_KIND: Record<string, string> = { user: "App user", guest: "Guest", club: "Club" };

/** The document a sanitised HTML email is shown in: its own CSP, no remote images, links in a new tab. */
export const FRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";
export function srcdocFor(html: string): string {
  return [
    "<!doctype html><html><head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`,
    '<meta name="referrer" content="no-referrer">',
    '<base target="_blank">',
    "<style>html,body{margin:0;padding:0}body{padding:12px;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2933;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>",
    "</head><body>",
    html,
    "</body></html>",
  ].join("");
}
