import { z } from "zod";

/**
 * Team work: the Support and Sales teams, sitting on top of the admin roles
 * (support-leads-contract.md). The role says what an admin may change on the
 * platform; the team says which queue they work. A person in neither team
 * reads the lists and counts, never a message body.
 */
export const TEAM_KEYS = ["support", "sales"] as const;
export type TeamKey = (typeof TEAM_KEYS)[number];

export const TEAM_LABEL: Record<TeamKey, string> = { support: "Support", sales: "Sales" };

const id = z.coerce.number();
const text = z.string().nullish().transform((v) => v ?? "");

/** Someone a case or a lead belongs to. */
export const personRefSchema = z.object({ id, name: text });
export type PersonRef = z.infer<typeof personRefSchema>;

export const teamMemberSchema = z.object({
  user_id: id,
  name: text,
  email: z.string().nullish(),
  admin_role: z.string().nullish(),
  away: z.boolean().catch(false),
  away_until: z.string().nullish(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamSchema = z.object({ key: z.string(), members: z.array(teamMemberSchema).catch([]) });
export type Team = z.infer<typeof teamSchema>;
export const teamsSchema = z.array(teamSchema);

/** An admin account the owner may put in a team (GET /admin/teams/eligible). */
export const eligibleAdminSchema = z
  .object({
    user_id: id.optional(),
    id: id.optional(),
    name: z.string().nullish(),
    full_name: z.string().nullish(),
    email: z.string().nullish(),
    admin_role: z.string().nullish(),
  })
  .transform((a) => ({ user_id: a.user_id ?? a.id ?? 0, name: a.name ?? a.full_name ?? a.email ?? "", email: a.email ?? null, admin_role: a.admin_role ?? null }))
  .refine((a) => a.user_id > 0);
export type EligibleAdmin = z.infer<typeof eligibleAdminSchema>;
export const eligibleAdminsSchema = z.array(eligibleAdminSchema).catch([]);

/** The side menu's counts: follow-ups due today and overdue, and the cases waiting on me. */
export const badgeSchema = z.object({
  due: z.coerce.number().catch(0),
  overdue: z.coerce.number().catch(0),
  cases: z.coerce.number().catch(0),
});
export type TeamworkBadge = z.infer<typeof badgeSchema>;

/** What a lead is: who it is, and what winning it means (a club signs up, a brand sponsors, a hall hosts…). */
export const LEAD_TYPES = ["club", "sponsor", "venue", "vendor", "other"] as const;
export type LeadType = (typeof LEAD_TYPES)[number];
export const LEAD_TYPE_LABEL: Record<LeadType, string> = { club: "Club", sponsor: "Sponsor", venue: "Venue partner", vendor: "Vendor", other: "Other" };
export const leadTypeLabel = (t: string) => (LEAD_TYPE_LABEL as Record<string, string>)[t] ?? words(t);

// --- follow-ups ----------------------------------------------------------------------------------

export const FOLLOW_UP_KINDS = ["call", "meeting", "email", "whatsapp", "visit", "other"] as const;
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number];
export const FOLLOW_UP_LABEL: Record<FollowUpKind, string> = {
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  whatsapp: "WhatsApp",
  visit: "Visit",
  other: "Other",
};
export const followUpLabel = (kind: string) => (FOLLOW_UP_LABEL as Record<string, string>)[kind] ?? words(kind);

export const followUpSchema = z.object({
  id,
  kind: z.string().catch("other"),
  title: text,
  due_at: z.string().nullish(),
  done: z.boolean().catch(false),
  done_at: z.string().nullish(),
  overdue: z.boolean().catch(false),
  owner: personRefSchema.nullish(),
  lead_id: id.nullish(),
  case_id: id.nullish(),
  lead: z.object({ id, name: text }).nullish(),
  case: z.object({ id, number: id.nullish(), subject: text }).nullish(),
});
export type FollowUp = z.infer<typeof followUpSchema>;

/** What PATCH /follow-ups/{id} answers: the follow-up, and whether its lead now has none open. */
export const followUpDoneSchema = z
  .object({ needs_next: z.boolean().catch(false) })
  .passthrough()
  .transform((r) => ({ needsNext: r.needs_next, followUp: followUpSchema.safeParse((r as Record<string, unknown>).follow_up ?? r).data ?? null }));

export interface FollowUpInput {
  lead_id?: number;
  case_id?: number;
  kind: FollowUpKind;
  title: string;
  due_at: string;
  owner_id?: number;
}

// --- my day --------------------------------------------------------------------------------------

/** A case as My day lists it: enough to say what it is and open it. */
export const caseLiteSchema = z.object({
  id,
  number: id.nullish(),
  subject: text,
  status: z.string().catch("open"),
  priority: z.string().catch("normal"),
  updated_at: z.string().nullish(),
  overdue: z.boolean().catch(false),
});
export type CaseLite = z.infer<typeof caseLiteSchema>;

export const myDaySchema = z.object({
  follow_ups_due: z.array(followUpSchema).catch([]),
  follow_ups_overdue: z.array(followUpSchema).catch([]),
  cases_mine_open: z.array(caseLiteSchema).catch([]),
  counts: z.record(z.coerce.number()).catch({}),
});
export type MyDay = z.infer<typeof myDaySchema>;

// --- reports -------------------------------------------------------------------------------------

/** One row of a breakdown: its name and whatever figures the server counts for it. */
const rowSchema = z.record(z.unknown());
const countsSchema = z.record(z.coerce.number()).catch({});

export const reportsSchema = z.object({
  support: z
    .object({
      first_reply_median_h: z.coerce.number().nullish(),
      resolution_median_h: z.coerce.number().nullish(),
      by_person: z.array(rowSchema).catch([]),
      by_topic: z.array(rowSchema).catch([]),
      survey: z.object({ yes: z.coerce.number().catch(0), no: z.coerce.number().catch(0) }).catch({ yes: 0, no: 0 }),
    })
    .catch({ first_reply_median_h: null, resolution_median_h: null, by_person: [], by_topic: [], survey: { yes: 0, no: 0 } }),
  leads: z
    .object({
      pipeline: z.record(countsSchema).catch({}),
      won_lost: z
        .object({
          won: z.coerce.number().catch(0),
          lost: z.coerce.number().catch(0),
          by_reason: z.union([countsSchema, z.array(rowSchema)]).catch({}),
        })
        .catch({ won: 0, lost: 0, by_reason: {} }),
      value_by_stage: countsSchema,
    })
    .catch({ pipeline: {}, won_lost: { won: 0, lost: 0, by_reason: {} }, value_by_stage: {} }),
});
export type TeamworkReports = z.infer<typeof reportsSchema>;

// --- desk settings -------------------------------------------------------------------------------

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
export const priorityLabel = (p: string) => (PRIORITY_LABEL as Record<string, string>)[p] ?? words(p);

export const ASSIGN_RULES = ["round_robin", "person"] as const;
export type AssignRule = (typeof ASSIGN_RULES)[number];

/** A help topic with its rule: new cases go round the Support team, or to one person. */
export const topicSchema = z.object({
  id: id.nullish(),
  key: z.string(),
  label: z.string(),
  assign: z.enum(ASSIGN_RULES).catch("round_robin"),
  assignee_id: id.nullish(),
  assignee: personRefSchema.nullish(),
  default_priority: z.string().catch("normal"),
});
export type Topic = z.infer<typeof topicSchema>;
export const topicsSchema = z.array(topicSchema).catch([]);

/** The public topic list (GET /support/topics): what the filters and the forms offer. */
export const publicTopicSchema = z.object({ key: z.string(), label: z.string() });
export const publicTopicsSchema = z.array(publicTopicSchema).catch([]);
export type PublicTopic = z.infer<typeof publicTopicSchema>;

export const savedReplySchema = z.object({ id, title: z.string(), body: text, topic: z.string().nullish() });
export type SavedReply = z.infer<typeof savedReplySchema>;
export const savedRepliesSchema = z.array(savedReplySchema).catch([]);

export const helpAnswerSchema = z
  .object({
    id,
    topic: z.string().nullish(),
    question: z.string(),
    answer: text,
    published: z.boolean().catch(true),
    order: z.coerce.number().nullish(),
    position: z.coerce.number().nullish(),
  })
  .transform(({ position, ...a }) => ({ ...a, order: a.order ?? position ?? 0 }));
export type HelpAnswer = z.infer<typeof helpAnswerSchema>;
export const helpAnswersSchema = z.array(helpAnswerSchema).catch([]);

/** Why a lead was lost: "no budget", "chose another". The server's word for the text may be label, name or reason. */
export const lostReasonSchema = z
  .object({ id, key: z.string().nullish(), label: z.string().nullish(), name: z.string().nullish(), reason: z.string().nullish() })
  .transform((r) => ({ id: r.id, key: r.key ?? null, label: r.label ?? r.name ?? r.reason ?? r.key ?? `Reason ${r.id}` }));
export type LostReason = z.infer<typeof lostReasonSchema>;
export const lostReasonsSchema = z.array(lostReasonSchema).catch([]);

/** Days of the week as the working hours may carry them: Monday first. */
export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DAY_LABEL: Record<(typeof WEEK_DAYS)[number], string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/**
 * The hours the reply timers count (default Mon–Sat 09:30–18:30 IST). Read
 * leniently: days as names ("mon") or as Python weekdays (0 = Monday), and
 * written back the way they came, so an edit never changes the encoding.
 */
export const workingHoursSchema = z
  .object({
    days: z.array(z.union([z.string(), z.number()])).optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    timezone: z.string().optional(),
  })
  .passthrough();
export type WorkingHours = z.infer<typeof workingHoursSchema>;

/** The API's own default: Python weekdays, Monday 0. */
export const DEFAULT_WORKING_HOURS: WorkingHours = { days: [0, 1, 2, 3, 4, 5], start: "09:30", end: "18:30", timezone: "Asia/Kolkata" };

export const deskSettingsSchema = z.object({
  working_hours: z.unknown().optional(),
  retention_days: z.coerce.number().catch(365),
  first_reply_target_hours: z.coerce.number().catch(4),
  resolution_target_hours: z.coerce.number().catch(16),
});
export type DeskSettings = z.infer<typeof deskSettingsSchema>;

/** The days a working-hours value covers, as names. */
export function dayNames(hours: WorkingHours): string[] {
  return (hours.days ?? []).map((d) => (typeof d === "number" ? (WEEK_DAYS[d] ?? String(d)) : d.toLowerCase().slice(0, 3)));
}

/** Days back in the encoding the server sent: numbers stay numbers. */
export function encodeDays(names: readonly string[], like: WorkingHours["days"]): (string | number)[] {
  const ordered = WEEK_DAYS.filter((d) => names.includes(d));
  if (like && like.length > 0 && typeof like[0] === "number") return ordered.map((d) => WEEK_DAYS.indexOf(d));
  return [...ordered];
}

// --- who may do what -----------------------------------------------------------------------------

/**
 * The signed-in admin's desk rights, from their admin role and the teams
 * they are in. For what is offered only: the server checks every one.
 *
 *                     cases                                   leads
 *   owner             everything                              everything, incl. reassigning
 *   support member    read bodies, answer/close own, take,    read; turn a case into a lead
 *                     log by hand
 *   sales member      read bodies                             own leads: edit, log, move; create
 *   anyone else       lists and counts, no bodies             read
 */
export interface TeamRights {
  meId: number | null;
  owner: boolean;
  support: boolean;
  sales: boolean;
  /** Message bodies, notes and the composer's thread. */
  readBodies: boolean;
  takeCases: boolean;
  logCases: boolean;
  assignCases: boolean;
  caseToLead: boolean;
  createLeads: boolean;
  reassignLeads: boolean;
  manageDesk: boolean;
  /** Answer, note, change status/priority/tags: owners, or the Support member the case is assigned to. */
  workCase: (assigneeId: number | null | undefined) => boolean;
  /** Edit, log, move stage: owners, or the Sales member who owns the lead. */
  workLead: (ownerId: number | null | undefined) => boolean;
}

export function teamRights({ meId, role, teams }: { meId: number | null; role: string | null; teams: readonly Team[] | null | undefined }): TeamRights {
  const owner = role === "owner";
  const inTeam = (key: TeamKey) => meId !== null && Boolean(teams?.some((t) => t.key === key && t.members.some((m) => m.user_id === meId)));
  const support = inTeam("support");
  const sales = inTeam("sales");
  return {
    meId,
    owner,
    support,
    sales,
    readBodies: owner || support || sales,
    takeCases: owner || support,
    logCases: owner || support,
    assignCases: owner,
    caseToLead: owner || support,
    createLeads: owner || sales,
    reassignLeads: owner,
    manageDesk: owner,
    workCase: (assigneeId) => owner || (support && meId !== null && assigneeId === meId),
    workLead: (ownerId) => owner || (sales && meId !== null && ownerId === meId),
  };
}

/** The members of one team, from the list GET /admin/teams answers. */
export function membersOf(teams: readonly Team[] | null | undefined, key: TeamKey): TeamMember[] {
  return teams?.find((t) => t.key === key)?.members ?? [];
}

/** A team member as a choice: their name, and that they are away. */
export function memberLabel(m: TeamMember): string {
  return `${m.name || m.email || `Admin ${m.user_id}`}${m.away ? " (away)" : ""}`;
}

export function words(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Hours as a person reads them: "45 min", "3.5 h", "2 d 4 h". */
export function hoursLabel(h: number | null | undefined): string {
  if (h === null || h === undefined || Number.isNaN(h)) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  const d = Math.floor(h / 24);
  const rest = Math.round(h - d * 24);
  return rest ? `${d} d ${rest} h` : `${d} d`;
}

/** A local date-time field's value ("2026-11-12T10:00") as the ISO instant the API takes. */
export function localToIso(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/** An ISO instant as a local date-time field's value. */
export function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Tomorrow at 10:00, local: where a new follow-up starts. */
export function tomorrowAtTen(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return isoToLocal(d.toISOString());
}
