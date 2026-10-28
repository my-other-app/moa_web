import { z } from "zod";

/**
 * Registration requests ("Confirm each registration"), as the club's API
 * sends them (the contract: feature-register/approvals-contract.md).
 *
 * With the setting on, filling the form does not register anyone: it makes
 * a request, which holds no place. The club confirms (a free ticket goes
 * out at once; a paid one gets a pay link and a held place) or declines.
 * The queue is oldest first, (submitted_at, id), and the lists page by a
 * keyset cursor (`next`), never by offset.
 */

export const REQUEST_STATUSES = ["pending", "approved", "declined", "withdrawn", "lapsed", "closed"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Waiting",
  approved: "Confirmed",
  declined: "Declined",
  withdrawn: "Withdrawn",
  lapsed: "Lapsed",
  closed: "Closed",
};

/** The page's tabs, in the order a request moves. Closed shows only once any request is (the event ended or was cancelled). */
export const STATUS_TABS: readonly RequestStatus[] = ["pending", "approved", "declined", "withdrawn", "lapsed"];

/** A tab: one status, or every request (`status=all`, newest first). */
export type RequestTab = RequestStatus | "all";
export const TAB_LABEL: Record<RequestTab, string> = { ...STATUS_LABEL, all: "All" };

/** The most requests one call may name (or take, with all_pending): the server's 500. */
export const MAX_IDS_PER_CALL = 500;
/**
 * What the dashboard confirms per call. Under the server's 500 so each call
 * is about one of its transactions (it confirms 100 at a time) and finishes
 * well inside the gateway's time, and so the progress bar moves.
 */
export const CHUNK_SIZE = 100;
/** What it declines per call: the server's most, since a decline is one statement however many it takes. */
export const DECLINE_CHUNK_SIZE = MAX_IDS_PER_CALL;
/** A page of the list. */
export const PAGE_SIZE = 50;
/** The longest note a decline can carry. */
export const NOTE_MAX = 300;

const optionalText = z.string().nullish().transform((v) => v ?? null);
const idText = z.union([z.string(), z.number()]).nullish().transform((v) => (v === null || v === undefined ? null : String(v)));

/** An unknown status reads as closed: shown, never offered an action the server would refuse. */
const statusSchema = z.string().transform((s): RequestStatus => ((REQUEST_STATUSES as readonly string[]).includes(s) ? (s as RequestStatus) : "closed"));

/** Who decided: a name, or a person object from a server that sends one. */
const decidedBySchema = z
  .union([z.string(), z.object({ full_name: z.string().nullish(), name: z.string().nullish(), email: z.string().nullish() }).passthrough()])
  .nullish()
  .transform((v) => (v === null || v === undefined ? null : typeof v === "string" ? v : (v.full_name ?? v.name ?? v.email ?? null)));

export const requestSchema = z.object({
  id: z.string(),
  status: statusSchema,
  full_name: z.string().nullish().transform((v) => v?.trim() || "Unnamed"),
  email: optionalText,
  phone: optionalText,
  ticket_type: z
    .object({ id: z.coerce.number(), name: z.string() })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  /** The form's answers: read by answerRows, whatever shape they come in. */
  answers: z.unknown().optional(),
  submitted_at: z.string(),
  decided_at: optionalText,
  decided_by: decidedBySchema,
  decline_note: optionalText,
  registration_id: idText,
  /** An approved paid request: the place is held until then. */
  pay_by: optionalText,
  /** The code they typed, re-checked when they're confirmed (code_invalid when it no longer applies). */
  discount_code: optionalText,
  /** A confirmed paid ticket's price, its code taken off; null until then, and for a free one. */
  amount: z.coerce.number().nullish().catch(null).transform((v) => (v === null || v === undefined || Number.isNaN(v) ? null : v)),
  /** They asked for their ticket on WhatsApp too. */
  whatsapp_opt_in: z.boolean().catch(false).default(false),
});
export type RegistrationRequest = z.infer<typeof requestSchema>;

export type RequestCounts = Record<RequestStatus, number>;

const rawCountsSchema = z.record(z.string(), z.number()).catch({});
const statusCounts = (c: Record<string, number>) => Object.fromEntries(REQUEST_STATUSES.map((s) => [s, Math.max(0, Math.trunc(c[s] ?? 0))])) as RequestCounts;

export const requestPageSchema = z
  .object({
    items: z.array(requestSchema),
    next: z.string().nullish().transform((v) => v || null),
    counts: rawCountsSchema,
    /** Places the event has left for someone new; null: no cap. */
    places_left: z.number().nullish().transform((v) => (v === null || v === undefined ? null : Math.max(0, v))),
  })
  .transform(({ counts, ...page }) => ({
    ...page,
    counts: statusCounts(counts),
    /**
     * Everyone who ever asked, as the server counts it (`counts.total`); null
     * from a server before it, which also has no export yet.
     */
    total: typeof counts.total === "number" && Number.isFinite(counts.total) ? Math.max(0, Math.trunc(counts.total)) : null,
  }));
export type RequestPage = z.infer<typeof requestPageSchema>;

const skippedSchema = z.array(z.object({ id: z.coerce.string(), reason: z.string().catch("unknown") })).catch([]);

export const approveResultSchema = z.object({
  approved: z
    .array(z.object({ id: z.coerce.string(), registration_id: idText, pay_by: optionalText }))
    .catch([]),
  skipped: skippedSchema,
  places_left: z.number().nullish().transform((v) => (v === null || v === undefined ? null : Math.max(0, v))),
});
export type ApproveResult = z.infer<typeof approveResultSchema>;

export const declineResultSchema = z.object({
  declined: z.array(z.coerce.string()).catch([]),
  skipped: skippedSchema,
});
export type DeclineResult = z.infer<typeof declineResultSchema>;

/** Reopen's answer: the ones back in the queue, and the ones that couldn't be (not_reopenable, already_open). */
export const reopenResultSchema = z.object({
  reopened: z.array(z.coerce.string()).catch([]).default([]),
  skipped: skippedSchema.default([]),
});
export type ReopenResult = z.infer<typeof reopenResultSchema>;

export const totalOf = (c: RequestCounts | null | undefined): number => (c ? REQUEST_STATUSES.reduce((sum, s) => sum + c[s], 0) : 0);

// ─── Words ──────────────────────────────────────────────────────────────

const num = (n: number) => n.toLocaleString("en-IN");
export const people = (n: number) => `${num(n)} ${n === 1 ? "person" : "people"}`;

/**
 * Why the server skipped a request, after "because". The contract's
 * reasons; anything else is said as the server named it.
 */
export const SKIP_REASON: Record<string, string> = {
  not_pending: "they were already decided or withdrawn, or someone else was deciding them at that moment",
  event_full: "the event is full",
  type_sold_out: "their ticket type is sold out",
  type_unavailable: "their ticket type isn't available any more",
  already_registered: "they're already registered",
  code_invalid: "their discount code no longer applies, so they wait for you to decide (they're never charged full price without being asked)",
  event_closed: "the event has closed",
  // Reopening.
  not_reopenable: "it isn't declined or lapsed any more",
  already_open: "they have asked again since, and that request is still open",
};

export function skipReasonText(reason: string): string {
  return SKIP_REASON[reason] ?? `of “${reason.replace(/_/g, " ")}”`;
}

/** Skips grouped by reason, the largest first: "10 because the event is full". */
export function skippedLines(skipped: Iterable<string>): { reason: string; count: number; text: string }[] {
  const byReason = new Map<string, number>();
  for (const reason of skipped) byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  return [...byReason.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count, text: `${num(count)} because ${skipReasonText(reason)}` }));
}

const RUPEES = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const PAISE = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₹199, ₹99.50. */
export const rupees = (value: number) => (Number.isInteger(value) ? RUPEES : PAISE).format(value);

/** "26 Oct 2026, 3:45 pm": a moment in India time, the zone the clubs run in. */
const INDIA = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function indiaTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : INDIA.format(d);
}

// ─── Answers ────────────────────────────────────────────────────────────

/** One of the event's own questions, as its detail lists them. */
export interface QuestionField {
  key: string;
  label?: string | null;
}

const answerValue = (v: unknown): string => {
  if (Array.isArray(v)) return v.map((x) => answerValue(x)).filter(Boolean).join(", ");
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("value" in o) return answerValue(o.value);
    return JSON.stringify(v);
  }
  return String(v);
};

/**
 * The form's answers as rows to read: the event's questions first, in its
 * order and by its labels (as the attendee detail shows them), then
 * anything else they answered. Takes `{key: answer}`, `{key: {label,
 * value}}` or `[{key, label, value}]`: the contract says the answers are
 * "keyed and labelled", and this reads any of those.
 */
export function answerRows(answers: unknown, fields: readonly QuestionField[] = []): { key: string; label: string; value: string }[] {
  const byKey = new Map<string, { label: string | null; value: string }>();
  if (Array.isArray(answers)) {
    for (const a of answers) {
      if (!a || typeof a !== "object") continue;
      const o = a as Record<string, unknown>;
      const key = String(o.key ?? o.label ?? byKey.size);
      byKey.set(key, { label: typeof o.label === "string" ? o.label : null, value: answerValue(o.value ?? o.answer) });
    }
  } else if (answers && typeof answers === "object") {
    for (const [key, v] of Object.entries(answers as Record<string, unknown>)) {
      const labelled = v && typeof v === "object" && !Array.isArray(v) && "value" in (v as object);
      const label = labelled && typeof (v as Record<string, unknown>).label === "string" ? ((v as Record<string, unknown>).label as string) : null;
      byKey.set(key, { label, value: answerValue(v) });
    }
  }
  const rows: { key: string; label: string; value: string }[] = [];
  for (const f of fields) {
    const a = byKey.get(f.key);
    if (!a) continue;
    rows.push({ key: f.key, label: f.label || a.label || f.key, value: a.value });
    byKey.delete(f.key);
  }
  for (const [key, a] of byKey) rows.push({ key, label: a.label || key.replace(/_/g, " "), value: a.value });
  return rows;
}

/** Sorts ids into queue order, oldest first: what the server confirms first. */
export function queueOrder<T extends { id: string; submitted_at: string }>(rows: readonly T[]): T[] {
  const at = (s: string) => {
    const t = Date.parse(s);
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };
  return [...rows].sort((a, b) => at(a.submitted_at) - at(b.submitted_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
