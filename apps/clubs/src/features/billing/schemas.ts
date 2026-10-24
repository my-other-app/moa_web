import { z } from "zod";

/**
 * Plans, the club's subscription and what it may do.
 *
 * Money crosses the wire in paise, as an integer, exactly as the backend
 * stores it. Only `formatPaise` divides, and only to display.
 */

export const CYCLES = ["monthly", "yearly"] as const;
export type Cycle = (typeof CYCLES)[number];

/** `?cycle=` and friends: anything that is not a cycle is monthly. */
export function cycleOf(value: unknown): Cycle {
  return value === "yearly" ? "yearly" : "monthly";
}

/** A plan key as the backend writes them (`free`, `growth`, `pro_2025`). */
export const PLAN_KEY = /^[a-z0-9_]{2,40}$/;

/** The plan a club is on with no subscription of its own (service.DEFAULT_PLAN_KEY). */
export const FREE_PLAN = "free";

/** `?plan=` from the pricing page: a plan key, or the free plan when absent or malformed. */
export function planKeyOf(value: unknown): string {
  return typeof value === "string" && PLAN_KEY.test(value) ? value : FREE_PLAN;
}

// ─── The public catalogue: GET /api/v1/plans ─────────────────────────────

const featureRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  included: z.boolean().catch(false),
});

export const catalogPlanSchema = z.object({
  id: z.coerce.number(),
  key: z.string(),
  name: z.string(),
  tagline: z.string().nullish(),
  price_monthly_paise: z.number().catch(0),
  price_yearly_paise: z.number().catch(0),
  trial_days: z.number().catch(0),
  contact_sales: z.boolean().catch(false),
  featured: z.boolean().catch(false),
  /** Each email / WhatsApp message past the monthly limit, in paise (₹0.10, ₹1). */
  email_overage_paise: z.number().catch(10),
  whatsapp_overage_paise: z.number().catch(100),
  /** null is unlimited, 0 is none allowed. */
  limits: z.record(z.string(), z.number().nullable()).catch({}),
  features: z.array(featureRowSchema).catch([]),
});
export type CatalogPlan = z.infer<typeof catalogPlanSchema>;

/** The free trial every new club starts with (14 days of Pro, no card). */
export const trialOfferSchema = z.object({
  days: z.number(),
  plan_key: z.string(),
  plan_name: z.string(),
  card_required: z.boolean().catch(false),
  then_plan_key: z.string().catch("free"),
});
export type TrialOffer = z.infer<typeof trialOfferSchema>;

export const catalogSchema = z.object({
  currency: z.string().catch("INR"),
  trial: trialOfferSchema.nullish().catch(null),
  /** How long an Enterprise trial (granted by the team after a call) runs. */
  enterprise_trial_days: z.number().nullish().catch(null),
  yearly_months_free: z.number().nullish().catch(null),
  plans: z.array(catalogPlanSchema),
});
export type Catalog = z.infer<typeof catalogSchema>;

// ─── The club's own: GET /clubs/subscription, /clubs/entitlements ────────

/**
 * pending   checkout opened, nothing confirmed by Razorpay: grants nothing
 * trial     Razorpay confirmed the mandate and the plan has a trial
 * active    paid
 * past_due  a charge failed; a plan once paid for stays on while Razorpay retries
 * paused    paused at Razorpay: not charged, so not granted
 * cancelled ended (or ending: see `entitled` and `current_period_end`)
 */
export const SUBSCRIPTION_STATUSES = ["pending", "trial", "active", "past_due", "paused", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Statuses with a Razorpay subscription that can still charge the club (service.LIVE_BILLED_STATUSES). */
export const LIVE_BILLED: readonly SubscriptionStatus[] = ["pending", "trial", "active", "past_due", "paused"];

const subscriptionPlanSchema = z.object({
  id: z.coerce.number(),
  key: z.string(),
  name: z.string(),
  tagline: z.string().nullish(),
  price_monthly_paise: z.number().catch(0),
  price_yearly_paise: z.number().catch(0),
  trial_days: z.number().catch(0),
});

/**
 * SubscriptionOut. The endpoint answers `null` for a club that never
 * subscribed. A status this build does not know fails the parse on purpose:
 * guessing at the state of someone's billing is worse than saying the page
 * could not load.
 */
export const subscriptionSchema = z.object({
  id: z.coerce.number(),
  plan: subscriptionPlanSchema.nullish(),
  cycle: z.enum(CYCLES).catch("monthly"),
  status: z.enum(SUBSCRIPTION_STATUSES),
  current_period_end: z.string().nullish(),
  mrr_paise: z.number().catch(0),
  last_failure_reason: z.string().nullish(),
  razorpay_subscription_id: z.string().nullish(),
  /** Whether this row grants its plan right now. */
  entitled: z.boolean().catch(false),
  /** The club cancelled; access runs until `current_period_end`. */
  cancel_at_period_end: z.boolean().catch(false),
  cancel_requested_at: z.string().nullish(),
  trial_ends_at: z.string().nullish(),
  /** While pending: when checkout opened, and when it falls back unpaid. */
  pending_since: z.string().nullish(),
  checkout_expires_at: z.string().nullish(),
  /** When Razorpay gave up retrying a failed charge (its "halted"). */
  halted_at: z.string().nullish().catch(null),
  /**
   * After a failed charge the club keeps its plan until this moment, then
   * moves to Free unless a payment lands. Null when nothing is owed.
   */
  grace_ends_at: z.string().nullish().catch(null),
  /** The server's own word on whether the club is in grace (worked out from `grace_ends_at` when absent). */
  in_grace: z.boolean().nullish().catch(null),
  /** MyOtherApp gave the club this plan free: nothing to pay, nothing to cancel. */
  complimentary: z.boolean().catch(false),
  /** When the free plan ends; null is no end date. */
  comp_ends_at: z.string().nullish().catch(null),
  /** The free trial (Pro, no card) is running: the club has `trial_plan` until `trial_ends_at`. */
  free_trial: z.boolean().catch(false),
  trial_plan: z.object({ key: z.string(), name: z.string() }).nullish().catch(null),
  /** A paid plan picked during the free trial (`plan`), billed from this date. */
  billing_starts_at: z.string().nullish().catch(null),
  /** An Enterprise trial the team granted, laid over everything else. */
  enterprise_trial: z
    .object({ plan: z.object({ key: z.string(), name: z.string() }).nullish(), started_at: z.string().nullish(), ends_at: z.string() })
    .nullish()
    .catch(null),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

/** In grace: the server's `in_grace`, or, from a server that does not send it, a grace end on a live subscription. */
export function inGrace(sub: Pick<Subscription, "in_grace" | "grace_ends_at" | "status"> | null | undefined): boolean {
  if (!sub) return false;
  if (typeof sub.in_grace === "boolean") return sub.in_grace;
  return Boolean(sub.grace_ends_at) && sub.status !== "cancelled";
}

/** EntitlementsOut: what grants the club its plan right now, and how much of it is used. */
export const entitlementsSchema = z.object({
  plan_key: z.string().nullish(),
  plan_name: z.string().nullish(),
  /** The status of whatever grants the plan: mid-checkout, the subscription the club had before. */
  status: z.enum(SUBSCRIPTION_STATUSES).nullish().catch(null),
  cycle: z.enum(CYCLES).nullish().catch(null),
  current_period_end: z.string().nullish(),
  limits: z.record(z.string(), z.number().nullable()).catch({}),
  features: z.record(z.string(), z.boolean()).catch({}),
  /** False: the platform has no free plan yet, so nothing is gated. */
  configured: z.boolean().catch(true),
  /** The plan picked on the sign-up form. */
  requested_plan: z.string().nullish(),
  requested_cycle: z.enum(CYCLES).nullish().catch(null),
  /** The club's own subscription row, whatever it grants: "pending" while a checkout waits. */
  subscription_status: z.enum(SUBSCRIPTION_STATUSES).nullish().catch(null),
  /**
   * Counted per club, in calendar months in India: events_per_month,
   * registrations_per_month, committee_seats, announcements_per_month. The
   * other limits have no count, so the page shows them as caps alone.
   */
  usage: z.record(z.string(), z.number()).catch({}),
  /**
   * Whether the server holds the club to its plan. False (or a server from
   * before enforcement) is the kill switch: nothing in the dashboard says
   * "locked" while it is off.
   */
  enforced: z.boolean().catch(false),
  /**
   * The enforcement cutoff, for reference only: which events keep what they
   * were made with is the server's call, per event (`plan_grandfathered` on
   * the event detail), and the dashboard never works it out from this.
   */
  grandfathered_before: z.string().nullish().catch(null),
  /** The plan is a gift from MyOtherApp: it cannot be bought, changed or cancelled here. */
  complimentary: z.boolean().catch(false),
  comp_ends_at: z.string().nullish().catch(null),
  /** The trial the plan comes from: the free trial ("free_trial", Pro, no card) or the team's ("enterprise_trial"). */
  trial: z
    .object({ kind: z.enum(["free_trial", "enterprise_trial"]), plan_key: z.string(), plan_name: z.string(), ends_at: z.string(), days_left: z.number() })
    .nullish()
    .catch(null),
  /** A paid plan picked during the free trial, billed from the trial's end. */
  chosen_plan: z
    .object({ plan_key: z.string(), plan_name: z.string(), cycle: z.enum(CYCLES).catch("monthly"), price_paise: z.number().catch(0), billing_starts_at: z.string(), status: z.string() })
    .nullish()
    .catch(null),
  /** The free trial is over and the club is on Free. */
  trial_ended: z.boolean().catch(false),
  free_trial_days: z.number().catch(14),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;

/** The last days of a trial, when the banner says so louder. */
export const TRIAL_URGENT_DAYS = 3;

export type TrialView =
  | { kind: "free_trial" | "enterprise_trial"; planName: string; endsAt: string; daysLeft: number; urgent: boolean; chosen: NonNullable<Entitlements["chosen_plan"]> | null }
  | { kind: "ended" }
  | null;

/** What the trial banner says, from the entitlements: a trial running, the free trial over (on Free), or nothing. */
export function trialView(ent: Entitlements | null | undefined): TrialView {
  if (!ent) return null;
  if (ent.trial) {
    return {
      kind: ent.trial.kind,
      planName: ent.trial.plan_name,
      endsAt: ent.trial.ends_at,
      daysLeft: ent.trial.days_left,
      urgent: ent.trial.days_left <= TRIAL_URGENT_DAYS,
      chosen: ent.trial.kind === "free_trial" ? (ent.chosen_plan ?? null) : null,
    };
  }
  if (ent.trial_ended && ent.plan_key === FREE_PLAN) return { kind: "ended" };
  return null;
}

/** "1 day" / "5 days". */
export function daysWord(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

/**
 * Whether the club's plan was given free by MyOtherApp. Either source says
 * so: the entitlements (what grants the plan) or the subscription row.
 */
export function complimentaryPlan(ent: Pick<Entitlements, "complimentary" | "comp_ends_at"> | null | undefined, sub: Pick<Subscription, "complimentary" | "comp_ends_at" | "status"> | null | undefined): { endsAt: string | null } | null {
  if (ent?.complimentary) return { endsAt: ent.comp_ends_at ?? sub?.comp_ends_at ?? null };
  if (sub?.complimentary && sub.status !== "cancelled") return { endsAt: sub.comp_ends_at ?? null };
  return null;
}

/** StartSubscriptionOut. It carries no public key: that is this build's NEXT_PUBLIC_RAZORPAY_KEY_ID. */
export const startSubscriptionSchema = z.object({
  checkout_url: z.string().nullish(),
  razorpay_subscription_id: z.string(),
  status: z.string().catch("pending"),
  razorpay_status: z.string().nullish(),
  plan_key: z.string(),
  cycle: z.enum(CYCLES).catch("monthly"),
  trial_days: z.number().catch(0),
  /** When Razorpay first charges: the free trial's end for a plan picked during it. */
  billing_starts_at: z.string().nullish().catch(null),
  /** When the checkout link stops working and the club falls back unpaid. */
  expires_at: z.string(),
});
export type StartSubscription = z.infer<typeof startSubscriptionSchema>;

// ─── Words ──────────────────────────────────────────────────────────────

/**
 * The caps the page shows, in the order the admin's plan editor lists them.
 * Ticket types and coupons per event are left out: nothing in the product
 * offers either yet, so a number for them would describe nothing.
 */
export const LIMIT_FIELDS = [
  { key: "events_per_month", label: "Events", unit: "this month" },
  { key: "registrations_per_month", label: "Registrations", unit: "this month, all events" },
  { key: "registrations_per_event", label: "Registrations per event", unit: "for one event" },
  { key: "merch_items_per_event", label: "Merchandise items", unit: "per event" },
  { key: "committee_seats", label: "Committee seats", unit: "logins with roles" },
  { key: "announcements_per_month", label: "Announcements", unit: "this month" },
  { key: "website_templates", label: "Website templates", unit: "to choose from" },
  { key: "emails_per_month", label: "Emails a month", unit: "a month" },
  { key: "whatsapp_per_month", label: "WhatsApp a month", unit: "a month" },
] as const;
export type LimitKey = (typeof LIMIT_FIELDS)[number]["key"];

/** The message limits: shown on their own card, with the extra and what it costs. */
export const MESSAGE_LIMITS: readonly string[] = ["emails_per_month", "whatsapp_per_month"];

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending: "Waiting for payment",
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  paused: "Paused",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<SubscriptionStatus, "default" | "info" | "success" | "warning" | "destructive"> = {
  pending: "warning",
  trial: "info",
  active: "success",
  past_due: "warning",
  paused: "default",
  cancelled: "destructive",
};

/** Where "Talk to us" goes: the contact address the public site gives. */
export const SALES_EMAIL = "support@myotherapp.in";

export function mailto(subject: string, body?: string): string {
  const q = new URLSearchParams({ subject });
  if (body) q.set("body", body);
  // URLSearchParams writes spaces as "+", which mail clients show literally.
  return `mailto:${SALES_EMAIL}?${q.toString().replace(/\+/g, "%20")}`;
}

const RUPEES = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const RUPEES_EXACT = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,499 — or ₹1,499.50 when there are paise to show. */
export function formatPaise(paise: number): string {
  return paise % 100 === 0 ? RUPEES.format(paise / 100) : RUPEES_EXACT.format(paise / 100);
}

export function priceFor(plan: Pick<CatalogPlan, "price_monthly_paise" | "price_yearly_paise">, cycle: Cycle): number {
  return cycle === "yearly" ? plan.price_yearly_paise : plan.price_monthly_paise;
}

export const isFree = (plan: Pick<CatalogPlan, "price_monthly_paise" | "price_yearly_paise">) =>
  plan.price_monthly_paise === 0 && plan.price_yearly_paise === 0;

/** What a plan costs a month on this cycle, and the line under it. */
export function priceLine(plan: CatalogPlan, cycle: Cycle): { amount: string; per: string; note: string | null } {
  if (plan.contact_sales) return { amount: "Custom", per: "", note: "Priced for your campus" };
  if (isFree(plan)) return { amount: formatPaise(0), per: "", note: "Free for ever" };
  if (cycle === "yearly" && plan.price_yearly_paise > 0) {
    return {
      // The monthly share of a yearly price, to the rupee: ₹9,990 a year reads as ₹833, not ₹832.50.
      amount: formatPaise(Math.round(plan.price_yearly_paise / 1200) * 100),
      per: "/ month",
      note: `${formatPaise(plan.price_yearly_paise)} billed yearly`,
    };
  }
  return { amount: formatPaise(plan.price_monthly_paise), per: "/ month", note: "Billed monthly" };
}

/** A cap as the plan includes it. Words of inclusion, not of refusal: the caps are not enforced yet. */
export function limitText(cap: number | null | undefined, unit?: string): string {
  if (cap === null || cap === undefined) return "Unlimited";
  if (cap === 0) return "Not included";
  return `${cap.toLocaleString("en-IN")}${unit ? ` ${unit}` : ""} included`;
}

/** A Razorpay subscription that can still charge the club (pending included). */
export function billedByRazorpay(sub: Subscription | null | undefined): sub is Subscription {
  return Boolean(sub?.razorpay_subscription_id) && LIVE_BILLED.includes(sub!.status);
}

/**
 * Whether a new checkout would be refused (409 SUBSCRIPTION_EXISTS): a
 * subscription Razorpay is running. A pending checkout is replaced instead,
 * unless the club already authorised it, which only the server knows.
 */
export function blocksCheckout(sub: Subscription | null | undefined): boolean {
  return billedByRazorpay(sub) && sub.status !== "pending";
}

/** Whether "Cancel plan" has anything to do: a Razorpay subscription not already set to end. */
export function cancellable(sub: Subscription | null | undefined): sub is Subscription {
  return billedByRazorpay(sub) && (sub.status === "pending" || !sub.cancel_at_period_end);
}
