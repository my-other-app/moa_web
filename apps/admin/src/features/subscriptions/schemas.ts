import { paginatedSchema } from "@moa/api";
import { formatDate, formatNumber } from "@moa/app-kit";
import { z } from "zod";

/**
 * Plans, limits and features.
 *
 * Money crosses the wire in paise as an integer, exactly as the database
 * stores it. The UI divides by 100 only to display, and multiplies back on
 * save -- a rupee float would lose the odd hundredth, which is the kind of
 * drift that only shows up in an annual reconciliation.
 */
export const PAISE_PER_RUPEE = 100;

export function rupees(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

export function paise(rupeeValue: number): number {
  return Math.round(rupeeValue * PAISE_PER_RUPEE);
}

/** The caps, in the order the editor lists them. (Storage was never metered and is no longer one.) */
export const LIMIT_FIELDS = [
  { key: "events_per_month", label: "Events", scope: "per month" },
  { key: "registrations_per_month", label: "Registrations", scope: "per month, all events" },
  { key: "registrations_per_event", label: "Registrations per event", scope: "cap for one event" },
  { key: "ticket_types_per_event", label: "Ticket types", scope: "per event" },
  { key: "coupons_per_event", label: "Coupon codes", scope: "per event" },
  { key: "merch_items_per_event", label: "Merchandise items", scope: "per event" },
  { key: "committee_seats", label: "Committee seats", scope: "separate logins with roles" },
  { key: "announcements_per_month", label: "Announcements", scope: "per month" },
  { key: "website_templates", label: "Website templates", scope: "to choose from" },
  { key: "ai_actions_per_month", label: "AI actions", scope: "per month, on MyOtherApp's AI" },
  { key: "emails_per_month", label: "Emails", scope: "per month, everything a club sends" },
  { key: "whatsapp_per_month", label: "WhatsApp messages", scope: "per month, on the platform's number" },
  { key: "whatsapp_marketing_per_month", label: "Promotional WhatsApp", scope: "of those, marketing templates (20% by default)" },
] as const;

/** The message limits: past them a paid plan pays the overage prices below, Free stops announcements. */
export const MESSAGE_LIMIT_KEYS = ["emails_per_month", "whatsapp_per_month"] as const;

/** The owner's overage prices, in paise: ₹0.10 an email, ₹1.50 a WhatsApp message. */
export const DEFAULT_EMAIL_OVERAGE_PAISE = 10;
export const DEFAULT_WHATSAPP_OVERAGE_PAISE = 150;

/** The plan every new club's free trial gives (subscriptions.service.FREE_TRIAL_PLAN_KEY). */
export const FREE_TRIAL_PLAN_KEY = "pro";

/**
 * The free trial's own monthly allowances, set on the trial's plan: the trial
 * keeps the plan's features with these. Empty means the plan's own.
 */
export const TRIAL_LIMIT_FIELDS = [
  { key: "emails_per_month", label: "Emails", scope: "per month during the trial" },
  { key: "whatsapp_per_month", label: "WhatsApp messages", scope: "per month during the trial" },
  { key: "whatsapp_marketing_per_month", label: "Promotional WhatsApp", scope: "of those" },
  { key: "ai_actions_per_month", label: "AI actions", scope: "per month during the trial" },
] as const;

export type LimitKey = (typeof LIMIT_FIELDS)[number]["key"];

/** Readable names for the thirty flags. The grouping comes from the API. */
export const FEATURE_LABELS: Record<string, string> = {
  tickets: "Tickets",
  certificates: "Certificates",
  checkin: "Door check-in",
  reviews: "Reviews",
  threads: "Threads",
  regform: "Custom registration form",
  waitlist: "Waitlist",
  coupons: "Coupons",
  links: "Tracking links",
  merch: "Merchandise",
  swag: "Swag",
  quiz: "Live quiz",
  qa: "Live Q&A",
  polls: "Polls",
  networking: "Networking",
  teams: "Teams and submissions",
  judging: "Judging rubrics",
  rounds: "Rounds and brackets",
  badges: "Badge printing",
  sessions: "Session check-in",
  report: "Event reports",
  website: "Website",
  custom_domain: "Custom domain",
  nobadge: "Remove MyOtherApp badge",
  finance: "Finance and expenses",
  roles: "Committee roles",
  tfa: "Enforced 2FA",
  payouts: "Next-day payouts",
  sso: "Student SSO",
  api: "API access",
};

export const GROUP_LABELS: Record<string, string> = {
  every_event: "Every event",
  grow: "Grow and engage",
  competitions: "Competitions",
  club: "Club",
};

export const planSchema = z.object({
  id: z.coerce.number(),
  key: z.string(),
  name: z.string(),
  tagline: z.string().nullish(),
  price_monthly_paise: z.number().default(0),
  price_yearly_paise: z.number().default(0),
  trial_days: z.number().default(0),
  visibility: z.enum(["public", "hidden", "legacy"]).catch("hidden"),
  sort_order: z.number().default(0),
  /* "Most popular" on the pricing page. */
  featured: z.boolean().default(false),
  /* Priced on request: the pricing page says "Talk to us" instead of a price,
     and a club cannot check out on it. */
  contact_sales: z.boolean().default(false),
  /* What each email / WhatsApp message past the monthly limit costs, in
     paise, added to the club's next Razorpay invoice. */
  email_overage_paise: z.number().default(DEFAULT_EMAIL_OVERAGE_PAISE),
  whatsapp_overage_paise: z.number().default(DEFAULT_WHATSAPP_OVERAGE_PAISE),
  /* False when a paid plan has no Razorpay plan behind it. The editor says so
     rather than letting someone publish it and find out at checkout. */
  billable: z.boolean().default(false),
  subscriber_count: z.number().default(0),
  /* null means unlimited, 0 means none allowed -- the two are different and
     the editor has to keep them apart. */
  limits: z.record(z.string(), z.number().nullable()).default({}),
  /* The free trial's own allowances on this plan; null each: the plan's own.
     A server from before them sends none. */
  trial_limits: z.record(z.string(), z.number().nullable()).catch({}).default({}),
  features: z.record(z.string(), z.boolean()).default({}),
  /* Sent by the API so the editor does not hold a second copy of the grouping
     that can drift from the backend's. */
  feature_groups: z.record(z.string(), z.array(z.string())).default({}),
});

export type Plan = z.infer<typeof planSchema>;

export const planListSchema = z.array(planSchema);

/**
 * pending   checkout opened, Razorpay has not confirmed it: grants nothing
 * trial     mandate confirmed, on the plan's trial
 * active    paid
 * past_due  a charge failed; kept on while Razorpay retries, if it was ever paid
 * paused    paused at Razorpay: not charged, not granted
 * cancelled ended, or ending at `current_period_end`
 */
export const SUBSCRIPTION_STATUSES = ["pending", "trial", "active", "past_due", "paused", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending: "Pending",
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  paused: "Paused",
  cancelled: "Cancelled",
};

/** A status this build has a word for, else the server's own, never a guess at "active". */
export function statusLabel(status: string): string {
  return (STATUS_LABEL as Record<string, string>)[status] ?? status.replace(/_/g, " ");
}

export const subscriptionSchema = z.object({
  id: z.coerce.number(),
  club: z.object({ id: z.coerce.number(), name: z.string() }).nullish(),
  plan: planSchema.nullish(),
  cycle: z.enum(["monthly", "yearly"]).catch("monthly"),
  /* Kept as the server says it. Falling back to "active" made a pending
     checkout, which grants nothing, read as a paying club. */
  status: z.string(),
  current_period_end: z.string().nullish(),
  mrr_paise: z.number().default(0),
  last_failure_reason: z.string().nullish(),
  razorpay_subscription_id: z.string().nullish(),
  /* Whether the row grants its plan right now (a pending checkout does not). */
  entitled: z.boolean().default(false),
  cancel_at_period_end: z.boolean().default(false),
  cancel_requested_at: z.string().nullish(),
  trial_ends_at: z.string().nullish(),
  pending_since: z.string().nullish(),
  checkout_expires_at: z.string().nullish(),
  /* When Razorpay stopped retrying a failed charge. */
  halted_at: z.string().nullish().catch(null),
  /* A failed charge keeps the plan on until this moment; then the club moves
     to Free unless a payment lands. Null when nothing is owed. */
  grace_ends_at: z.string().nullish().catch(null),
  /* The server's own word on whether the row is in grace. */
  in_grace: z.boolean().nullish().catch(null),
  /* Given free by an admin: the club pays nothing and the row is never
     counted as revenue. A server from before free plans sends none of these. */
  complimentary: z.boolean().catch(false).default(false),
  comp_reason: z.string().nullish().catch(null),
  /* When the free plan ends; null is no end date. */
  comp_ends_at: z.string().nullish().catch(null),
  granted_by: z.object({ id: z.coerce.number(), name: z.string().nullish() }).nullish().catch(null),
  /* The free trial (Pro, no card, once per club) is running: the club has
     `trial_plan` until `trial_ends_at`, whatever `plan` and `status` say. */
  free_trial: z.boolean().catch(false).default(false),
  trial_plan: z.object({ key: z.string(), name: z.string() }).nullish().catch(null),
  /* A paid plan picked during the free trial (`plan`), billed from this date. */
  billing_starts_at: z.string().nullish().catch(null),
  /* Whether the club has ever had its free trial. */
  trial_used: z.boolean().catch(false).default(false),
  trial_started_at: z.string().nullish().catch(null),
  /* An Enterprise trial an admin granted, laid over everything above. */
  enterprise_trial: z
    .object({ plan: z.object({ key: z.string(), name: z.string() }).nullish(), started_at: z.string().nullish(), ends_at: z.string() })
    .nullish()
    .catch(null),
  enterprise_trial_by: z.object({ id: z.coerce.number(), name: z.string().nullish() }).nullish().catch(null),
});

export type Subscription = z.infer<typeof subscriptionSchema>;

/** The trial a row's club is on now: the team's Enterprise trial first, then the free trial. */
export function runningTrial(row: Pick<Subscription, "free_trial" | "trial_plan" | "trial_ends_at" | "enterprise_trial"> | null | undefined):
  | { kind: "enterprise"; planName: string; endsAt: string }
  | { kind: "free"; planName: string; endsAt: string }
  | null {
  if (!row) return null;
  if (row.enterprise_trial) return { kind: "enterprise", planName: row.enterprise_trial.plan?.name ?? "Enterprise", endsAt: row.enterprise_trial.ends_at };
  if (row.free_trial && row.trial_ends_at) return { kind: "free", planName: row.trial_plan?.name ?? "Pro", endsAt: row.trial_ends_at };
  return null;
}

/** "Enterprise trial · until 23 Nov 2026" for the badge a trial wears. */
export function trialBadgeText(row: Parameters<typeof runningTrial>[0]): string | null {
  const trial = runningTrial(row);
  return trial ? `${trial.planName} trial · until ${formatDate(trial.endsAt)}` : null;
}

/** An Enterprise trial's length: the API's bounds, and the owner's default. */
export const ENTERPRISE_TRIAL_DAYS = { min: 1, max: 365, default: 30 } as const;

export function trialDaysProblem(days: number): string | null {
  if (!Number.isInteger(days)) return "Whole days only.";
  if (days < ENTERPRISE_TRIAL_DAYS.min || days > ENTERPRISE_TRIAL_DAYS.max) return `Between ${ENTERPRISE_TRIAL_DAYS.min} and ${ENTERPRISE_TRIAL_DAYS.max} days.`;
  return null;
}

/**
 * "Free · until 31 Mar 2027", or "Free · no end date": the badge a free plan
 * wears wherever it is listed. Null for a row that is paid for.
 */
export function freeBadgeText(row: Pick<Subscription, "complimentary" | "comp_ends_at">): string | null {
  if (!row.complimentary) return null;
  return row.comp_ends_at ? `Free · until ${formatDate(row.comp_ends_at)}` : "Free · no end date";
}

/** Who gave the free plan and why, for a tooltip or a line under it. */
export function freePlanNote(row: Pick<Subscription, "complimentary" | "comp_reason" | "granted_by">): string | null {
  if (!row.complimentary) return null;
  const by = row.granted_by?.name ? `Given by ${row.granted_by.name}` : null;
  return [row.comp_reason?.trim() || null, by].filter(Boolean).join(" · ") || null;
}

// ─── Giving a club a plan ────────────────────────────────────────────────

/** The longest reason the API keeps for a free plan. */
export const REASON_MAX = 200;

export interface GivePlanInput {
  planId: number | null;
  cycle: "monthly" | "yearly";
  /** Free for this club: ₹0, not counted as revenue. */
  complimentary: boolean;
  reason: string;
  /** "YYYY-MM-DD" from the date field, or null for no end date. */
  endsOn: string | null;
}

/** What is wrong with the form, field by field; empty when it can be sent. */
export function givePlanProblems(input: GivePlanInput, today: Date = new Date()): Partial<Record<"plan" | "reason" | "endsOn", string>> {
  const problems: Partial<Record<"plan" | "reason" | "endsOn", string>> = {};
  if (!input.planId) problems.plan = "Pick a plan.";
  const reason = input.reason.trim();
  if (input.complimentary && !reason) problems.reason = "Say why this club gets it free.";
  else if (reason.length > REASON_MAX) problems.reason = `At most ${REASON_MAX} characters.`;
  if (input.complimentary && input.endsOn !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endsOn)) problems.endsOn = "Pick the day it ends.";
    else if (input.endsOn < localDay(today)) problems.endsOn = "That day has passed.";
  }
  return problems;
}

/** "YYYY-MM-DD" for a moment, in the browser's own calendar. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The end of the chosen day in India, where the clubs are: a plan "free until
 * 31 Mar" still works on the evening of the 31st.
 */
export function endOfDayIst(day: string): string {
  return `${day}T23:59:59+05:30`;
}

/** The body PUT /admin/subscriptions/club/{id}/plan takes. */
export function givePlanPayload(input: GivePlanInput, cancelRazorpay = false) {
  const reason = input.reason.trim();
  return {
    plan_id: input.planId,
    cycle: input.cycle,
    complimentary: input.complimentary,
    ...(reason ? { reason } : {}),
    ends_at: input.complimentary && input.endsOn ? endOfDayIst(input.endsOn) : null,
    ...(cancelRazorpay ? { cancel_razorpay: true } : {}),
  };
}

/**
 * The sentence under the form: what the club ends up with, and whether it
 * counts as money.
 */
export function givePlanSummary(input: GivePlanInput, plan: Pick<Plan, "name" | "price_monthly_paise" | "price_yearly_paise"> | null | undefined): string | null {
  if (!plan) return null;
  if (input.complimentary) {
    const until = input.endsOn ? `free until ${formatDate(`${input.endsOn}T12:00:00+05:30`)}` : "free with no end date";
    return `${plan.name}, ${until} — ₹0, not counted in revenue`;
  }
  const price = input.cycle === "yearly" ? plan.price_yearly_paise : plan.price_monthly_paise;
  const per = input.cycle === "yearly" ? "a year" : "a month";
  return `${plan.name}, ${input.cycle} — ₹${formatNumber(Math.round(rupees(price)))} ${per}, counted in revenue. Nothing is charged through Razorpay.`;
}

/**
 * Whether a row is in its grace period: a failed charge, the plan still on,
 * the clock running. The server says so in `in_grace`; worked out from
 * `grace_ends_at` only for a server that does not.
 */
export function inGrace(row: Pick<Subscription, "grace_ends_at" | "status" | "in_grace">): boolean {
  if (typeof row.in_grace === "boolean") return row.in_grace;
  return Boolean(row.grace_ends_at) && row.status !== "cancelled";
}

/** The grace an admin may add at once, in days (the API's bounds). */
export const GRACE_DAYS = { min: 1, max: 30 } as const;

export function graceDaysProblem(days: number): string | null {
  if (!Number.isInteger(days)) return "Whole days only.";
  if (days < GRACE_DAYS.min || days > GRACE_DAYS.max) return `Between ${GRACE_DAYS.min} and ${GRACE_DAYS.max} days.`;
  return null;
}
export const subscriptionPageSchema = paginatedSchema(subscriptionSchema);

export const totalsSchema = z.object({
  mrr_paise: z.number().default(0),
  arr_paise: z.number().default(0),
  active_subscriptions: z.number().default(0),
  trialing: z.number().default(0),
  past_due: z.number().default(0),
  cancelled: z.number().default(0),
  /* Checkouts opened and not paid: they grant nothing. */
  pending: z.number().default(0),
  paused: z.number().default(0),
  /* A failed charge, the plan kept on until its grace ends. These are also
     counted in past_due: never add the two. */
  in_grace: z.number().default(0),
  /* Plans an admin gave free: on a plan, paying nothing, not revenue. */
  complimentary: z.number().catch(0).default(0),
  /* Free Pro trials (no card) and the team's Enterprise trials, running. */
  free_trials: z.number().catch(0).default(0),
  enterprise_trials: z.number().catch(0).default(0),
});

export type SubscriptionTotals = z.infer<typeof totalsSchema>;

/**
 * The editor's form shape.
 *
 * Prices are rupees here and paise on the wire; `toPayload` is the only place
 * that converts, so a second conversion cannot creep in somewhere else and
 * multiply a price by a hundred.
 */
export const planFormSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2, "The key needs at least 2 characters")
    .max(40)
    .regex(/^[a-z0-9_]+$/, "Lower case letters, numbers and underscores only"),
  name: z.string().trim().min(2, "Name the plan").max(80),
  tagline: z.string().trim().max(160).optional(),
  price_monthly_rupees: z.number().min(0),
  price_yearly_rupees: z.number().min(0),
  trial_days: z.number().int().min(0).max(365),
  visibility: z.enum(["public", "hidden", "legacy"]),
  sort_order: z.number().int().min(0).default(0),
  featured: z.boolean(),
  contact_sales: z.boolean(),
  /** Each extra email and WhatsApp message, in rupees (₹0.10, ₹1.50). */
  email_overage_rupees: z.number().min(0),
  whatsapp_overage_rupees: z.number().min(0),
  limits: z.record(z.string(), z.number().nullable()),
  /** The free trial's allowances on this plan (null: the plan's own). */
  trial_limits: z.record(z.string(), z.number().nullable()).default({}),
  features: z.record(z.string(), z.boolean()),
});

export type PlanFormInput = z.infer<typeof planFormSchema>;

export function toForm(plan: Plan): PlanFormInput {
  return {
    key: plan.key,
    name: plan.name,
    tagline: plan.tagline ?? "",
    price_monthly_rupees: rupees(plan.price_monthly_paise),
    price_yearly_rupees: rupees(plan.price_yearly_paise),
    trial_days: plan.trial_days,
    visibility: plan.visibility,
    sort_order: plan.sort_order,
    featured: plan.featured,
    contact_sales: plan.contact_sales,
    email_overage_rupees: rupees(plan.email_overage_paise),
    whatsapp_overage_rupees: rupees(plan.whatsapp_overage_paise),
    limits: { ...plan.limits },
    trial_limits: { ...plan.trial_limits },
    features: { ...plan.features },
  };
}

export function toPayload(form: PlanFormInput) {
  return {
    key: form.key,
    name: form.name,
    tagline: form.tagline || null,
    price_monthly_paise: paise(form.price_monthly_rupees),
    price_yearly_paise: paise(form.price_yearly_rupees),
    trial_days: form.trial_days,
    visibility: form.visibility,
    sort_order: form.sort_order,
    featured: form.featured,
    contact_sales: form.contact_sales,
    email_overage_paise: paise(form.email_overage_rupees),
    whatsapp_overage_paise: paise(form.whatsapp_overage_rupees),
    limits: form.limits,
    trial_limits: Object.fromEntries(TRIAL_LIMIT_FIELDS.map((f) => [f.key, form.trial_limits[f.key] ?? null])),
    features: form.features,
  };
}

/** "1,000 (up to 200 promotional)", "Unlimited", "None": a plan's WhatsApp, as the pricing page says it. */
export function whatsappAllowance(limits: Record<string, number | null | undefined>): string {
  const all = limits.whatsapp_per_month;
  if (all === null || all === undefined) return "Unlimited";
  if (all === 0) return "None";
  const promo = limits.whatsapp_marketing_per_month;
  const base = formatNumber(all);
  return typeof promo === "number" ? `${base} (up to ${formatNumber(promo)} promotional)` : base;
}

// ─── Giving existing clubs the free trial ────────────────────────────────

const giftClubSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  created_at: z.string().nullish(),
});
export type GiftClub = z.infer<typeof giftClubSchema>;

/** GET /admin/subscriptions/trial-gift: who would get the trial now, and why the rest would not. */
export const trialGiftPreviewSchema = z.object({
  available: z.boolean().catch(false),
  plan_key: z.string().nullish(),
  plan_name: z.string().nullish(),
  days: z.number().catch(14),
  then_plan_key: z.string().catch("free"),
  allowances: z.record(z.string(), z.number().nullable()).catch({}),
  unlocks: z.array(z.string()).catch([]),
  eligible: z.number().catch(0),
  sample: z.array(giftClubSchema).catch([]),
  excluded: z.array(z.object({ reason: z.string(), label: z.string(), count: z.number() })).catch([]),
});
export type TrialGiftPreview = z.infer<typeof trialGiftPreviewSchema>;

/** POST /admin/subscriptions/trial-gift: what was started. */
export const trialGiftResultSchema = z.object({
  started: z.number().catch(0),
  emailed: z.number().catch(0),
  skipped: z.number().catch(0),
  remaining: z.number().catch(0),
  ends_at: z.string().nullish(),
  clubs: z.array(giftClubSchema).catch([]),
});
export type TrialGiftResult = z.infer<typeof trialGiftResultSchema>;

/** "2,000 emails, 50 WhatsApp messages and 50 AI actions a month", from the trial's allowances. */
export function allowancesLine(allowances: Record<string, number | null | undefined>): string | null {
  const parts = (
    [
      ["emails_per_month", "email", "emails"],
      ["whatsapp_per_month", "WhatsApp message", "WhatsApp messages"],
      ["ai_actions_per_month", "AI action", "AI actions"],
    ] as const
  )
    .map(([key, one, many]) => {
      const n = allowances[key];
      return typeof n === "number" && n > 0 ? `${formatNumber(n)} ${n === 1 ? one : many}` : null;
    })
    .filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${joined} a month`;
}

/** "₹0.10", "₹1", "₹1.50": a per-message price, to the paisa. */
export function perMessage(paiseValue: number): string {
  const r = rupees(paiseValue);
  return Number.isInteger(r) ? `₹${r}` : `₹${r.toFixed(2)}`;
}

/** The rule the API enforces, checked here so the form says so before saving. */
export function yearlyPriceProblem(form: PlanFormInput): string | null {
  if (form.price_yearly_rupees > form.price_monthly_rupees * 12) {
    return "The yearly price is more than twelve months of the monthly one.";
  }
  return null;
}
