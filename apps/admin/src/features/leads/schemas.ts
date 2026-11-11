import { z } from "zod";

import { personRefSchema, words } from "@/features/teamwork";

/**
 * Sales leads (support-leads-contract.md): organisations we want something
 * from — a club to sign up, a brand to sponsor, a hall to host, a vendor to
 * recommend — moving New → Contacted → Meeting → Proposal → Negotiation →
 * Won or Lost, each with a next follow-up on a date.
 */
export const STAGES = ["new", "contacted", "meeting", "proposal", "negotiation", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { new: "New", contacted: "Contacted", meeting: "Meeting", proposal: "Proposal", negotiation: "Negotiation", won: "Won", lost: "Lost" };
export const stageLabel = (s: string) => (STAGE_LABEL as Record<string, string>)[s] ?? words(s);

export const SOURCES = ["for_clubs", "referral", "event", "outreach", "inbound_email", "import", "signup", "speaker", "other"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<Source, string> = {
  for_clubs: "For-clubs page",
  referral: "Referral",
  event: "At an event",
  outreach: "Outreach",
  inbound_email: "Email to sales@",
  import: "Import",
  signup: "Signed up by itself",
  speaker: "A speaker",
  other: "Other",
};
export const sourceLabel = (s: string) => (SOURCE_LABEL as Record<string, string>)[s] ?? words(s);

export const ACTIVITY_KINDS = ["call", "meeting", "email", "whatsapp", "note"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_LABEL: Record<string, string> = { call: "Call", meeting: "Meeting", email: "Email", whatsapp: "WhatsApp", note: "Note", file: "File", stage_change: "Stage", system: "System" };
export const activityLabel = (k: string) => ACTIVITY_LABEL[k] ?? words(k);

export const DUE_FILTERS = [
  { value: "", label: "Any follow-up" },
  { value: "today", label: "Due today" },
  { value: "overdue", label: "Overdue" },
  { value: "week", label: "Due this week" },
] as const;

const id = z.coerce.number();
const text = z.string().nullish().transform((v) => v ?? "");

export const nextFollowUpSchema = z.object({ id, due_at: z.string().nullish(), kind: z.string().catch("other"), title: text });

export const leadRowSchema = z.object({
  id,
  name: z.string(),
  type: z.string().catch("other"),
  stage: z.string().catch("new"),
  city: z.string().nullish(),
  owner: personRefSchema.nullish(),
  value_inr: z.coerce.number().nullish(),
  expected_close: z.string().nullish(),
  next_follow_up: nextFollowUpSchema.nullish(),
  overdue: z.boolean().catch(false),
  contacts_count: z.coerce.number().catch(0),
  updated_at: z.string().nullish(),
});
export type LeadRow = z.infer<typeof leadRowSchema>;

export const leadPageSchema = z.object({
  items: z.array(leadRowSchema),
  total: z.coerce.number().catch(0),
  by_stage: z.record(z.coerce.number()).catch({}),
});
export type LeadPage = z.infer<typeof leadPageSchema>;

export const contactSchema = z.object({
  id,
  name: z.string(),
  role: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  whatsapp: z.string().nullish(),
  preferred_channel: z.string().nullish(),
  is_primary: z.boolean().catch(false),
});
export type Contact = z.infer<typeof contactSchema>;

export const activitySchema = z.object({
  id,
  kind: z.string().catch("note"),
  body: z.string().nullish(),
  occurred_at: z.string().nullish(),
  author_name: z.string().nullish(),
  contact_id: id.nullish(),
  contact: z.object({ id, name: text }).nullish(),
  details: z.record(z.unknown()).nullish(),
});
export type Activity = z.infer<typeof activitySchema>;

export const leadFileSchema = z
  .object({
    id,
    name: z.string().nullish(),
    filename: z.string().nullish(),
    size: z.coerce.number().nullish(),
    size_bytes: z.coerce.number().nullish(),
    url: z.string().nullish(),
    created_at: z.string().nullish(),
    uploaded_by_name: z.string().nullish(),
  })
  .transform((f) => ({ id: f.id, name: f.name ?? f.filename ?? `File ${f.id}`, size: f.size ?? f.size_bytes ?? null, url: f.url ?? null, created_at: f.created_at ?? null, by: f.uploaded_by_name ?? null }));
export type LeadFile = z.infer<typeof leadFileSchema>;

export const followUpRowSchema = z.object({
  id,
  kind: z.string().catch("other"),
  title: text,
  due_at: z.string().nullish(),
  done: z.boolean().catch(false),
  overdue: z.boolean().catch(false),
  owner: personRefSchema.nullish(),
});
export type LeadFollowUp = z.infer<typeof followUpRowSchema>;

export const leadDetailSchema = leadRowSchema
  .extend({
    website: z.string().nullish(),
    source: z.string().nullish(),
    tags: z.array(z.string()).catch([]),
    club_id: id.nullish(),
    case_id: id.nullish(),
    lost_reason: z.string().nullish(),
    lost_note: z.string().nullish(),
    retry_on: z.string().nullish(),
    renewal_on: z.string().nullish(),
    merged_into_id: id.nullish(),
    contacts: z.array(contactSchema).catch([]),
    timeline: z.array(activitySchema).nullish(),
    activities: z.array(activitySchema).nullish(),
    files: z.array(leadFileSchema).catch([]),
    follow_ups: z.array(followUpRowSchema).catch([]),
    linked: z.record(z.unknown()).nullish(),
    linked_records: z.record(z.unknown()).nullish(),
    /** The server's word: the signed-in admin may change this lead. */
    can_edit: z.boolean().nullish(),
    /** A Sales member may take a lead nobody owns. */
    can_take: z.boolean().nullish(),
  })
  .transform(({ timeline, activities, linked, linked_records, ...l }) => ({ ...l, timeline: timeline ?? activities ?? [], linked: linked ?? linked_records ?? null }));
export type LeadDetail = z.infer<typeof leadDetailSchema>;

/** Where a lead's file opens: an API path through the gateway (the cookie goes with it), a signed https link as it is. */
export function fileHref(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/v1/")) return `/api/gateway${url}`;
  if (url.startsWith("https://")) return url;
  return null;
}

/** PATCH /leads/{id}: the lead, and whether a stage move left it with no open follow-up. */
export const leadPatchResultSchema = z
  .object({ needs_follow_up: z.boolean().catch(false) })
  .passthrough()
  .transform((r) => ({ needsFollowUp: r.needs_follow_up }));

export const duplicateMatchSchema = z.object({ id, name: z.string(), city: z.string().nullish() });
export type DuplicateMatch = z.infer<typeof duplicateMatchSchema>;

/** The leads a new one may repeat: refused with 409 DUPLICATE_LEAD until sent again with `force`. */
export class DuplicateLeadError extends Error {
  readonly matches: DuplicateMatch[];
  constructor(matches: DuplicateMatch[], message = "This lead may already be here.") {
    super(message);
    this.name = "DuplicateLeadError";
    this.matches = matches;
  }
}

/** The matches, wherever the 409's body carries them: at the top, under `errors`, or under `data`. */
export function readMatches(body: unknown): DuplicateMatch[] | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  for (const candidate of [b.matches, (b.errors as Record<string, unknown> | undefined)?.matches, (b.data as Record<string, unknown> | undefined)?.matches, (b.detail as Record<string, unknown> | undefined)?.matches]) {
    const parsed = z.array(duplicateMatchSchema).safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export const IMPORT_STATUSES = ["new", "duplicate", "error"] as const;
export const importRowSchema = z.object({
  row: z.coerce.number(),
  name: z.string().nullish(),
  type: z.string().nullish(),
  city: z.string().nullish(),
  email: z.string().nullish(),
  status: z.string().catch("error"),
  match_id: id.nullish(),
  error: z.string().nullish(),
});
export type ImportRow = z.infer<typeof importRowSchema>;
export const importResultSchema = z.object({ rows: z.array(importRowSchema).catch([]), created: z.coerce.number().nullish() });
export type ImportResult = z.infer<typeof importResultSchema>;

/** How a dry run reads: so many new, so many already here, so many that can't be read. */
export function importSummary(rows: readonly ImportRow[]): { new: number; duplicate: number; error: number } {
  const out = { new: 0, duplicate: 0, error: 0 };
  for (const r of rows) {
    if (r.status === "new") out.new += 1;
    else if (r.status === "duplicate") out.duplicate += 1;
    else out.error += 1;
  }
  return out;
}

/**
 * What dropping a lead on a stage does: nothing (same stage), nothing for
 * someone who may not move it, ask why for Lost (a reason is required), or
 * move it.
 */
export type StageMove = "noop" | "denied" | "needs_reason" | "move";
export function stageMove(from: string, to: string, canMove: boolean): StageMove {
  if (from === to) return "noop";
  if (!canMove) return "denied";
  if (to === "lost") return "needs_reason";
  return "move";
}

/** Leads grouped into the board's columns, in stage order; a stage this build doesn't know is left out. */
export function byStage(items: readonly LeadRow[]): Record<Stage, LeadRow[]> {
  const out = Object.fromEntries(STAGES.map((s) => [s, [] as LeadRow[]])) as Record<Stage, LeadRow[]>;
  for (const l of items) (out as Record<string, LeadRow[]>)[l.stage]?.push(l);
  return out;
}

/** The lead form's starting values from the address: "Make a lead" on a speaker sends name, type and source. */
export interface LeadPrefill {
  name?: string;
  type?: string;
  source?: string;
  city?: string;
  website?: string;
}

export function prefillFrom(params: URLSearchParams): LeadPrefill | null {
  if (params.get("new") !== "1") return null;
  const out: LeadPrefill = {};
  for (const k of ["name", "type", "source", "city", "website"] as const) {
    const v = params.get(k)?.trim();
    if (v) out[k] = v.slice(0, 200);
  }
  return out;
}

/** The address that opens the new-lead form filled in. */
export function newLeadHref(prefill: LeadPrefill): string {
  const params = new URLSearchParams({ new: "1" });
  for (const [k, v] of Object.entries(prefill)) if (v) params.set(k, v);
  return `/teamwork/leads?${params.toString()}`;
}
