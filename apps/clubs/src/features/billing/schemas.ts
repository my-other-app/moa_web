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
  /**
   * POST /clubs/subscription/start takes the plan's numeric id. The public
   * catalogue is specified by key; the id is read when it is there, and a
   * plan without one cannot be bought from here (see `planIdOf`).
   */
  id: z.coerce.number().nullish().catch(null),
  key: z.string(),
  name: z.string(),
  tagline: z.string().nullish(),
  price_monthly_paise: z.number().catch(0),
  price_yearly_paise: z.number().catch(0),
  trial_days: z.number().catch(0),
  contact_sales: z.boolean().catch(false),
  featured: z.boolean().catch(false),
  /** null is unlimited, 0 is none allowed. */
  limits: z.record(z.string(), z.number().nullable()).catch({}),
  features: z.array(featureRowSchema).catch([]),
});
export type CatalogPlan = z.infer<typeof catalogPlanSchema>;

export const catalogSchema = z.object({
  currency: z.string().catch("INR"),
  yearly_months_free: z.number().nullish().catch(null),
  plans: z.array(catalogPlanSchema),
});
export type Catalog = z.infer<typeof catalogSchema>;

// ─── The club's own: GET /clubs/subscription, /clubs/entitlements ────────

export const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

const subscriptionPlanSchema = z.object({
  id: z.coerce.number(),
  key: z.string(),
  name: z.string(),
  tagline: z.string().nullish(),
  price_monthly_paise: z.number().catch(0),
  price_yearly_paise: z.number().catch(0),
  trial_days: z.number().catch(0),
});

/** SubscriptionOut. The endpoint answers `null` for a club that never subscribed. */
export const subscriptionSchema = z.object({
  id: z.coerce.number(),
  plan: subscriptionPlanSchema.nullish(),
  cycle: z.enum(CYCLES).catch("monthly"),
  status: z.enum(SUBSCRIPTION_STATUSES).catch("active"),
  current_period_end: z.string().nullish(),
  mrr_paise: z.number().catch(0),
  last_failure_reason: z.string().nullish(),
  razorpay_subscription_id: z.string().nullish(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

/** EntitlementsOut, plus the usage the page shows bars for once the server sends it. */
export const entitlementsSchema = z.object({
  plan_key: z.string().nullish(),
  plan_name: z.string().nullish(),
  status: z.enum(SUBSCRIPTION_STATUSES).nullish().catch(null),
  cycle: z.enum(CYCLES).nullish().catch(null),
  current_period_end: z.string().nullish(),
  limits: z.record(z.string(), z.number().nullable()).catch({}),
  features: z.record(z.string(), z.boolean()).catch({}),
  /** False: the platform has no free plan yet, so nothing is gated. */
  configured: z.boolean().catch(true),
  /**
   * How much of each limit is used, keyed like `limits`. Not sent by the
   * server yet; without it the page shows each cap and no bar.
   */
  usage: z.record(z.string(), z.number().nullable()).nullable().default(null).catch(null),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;

/** StartSubscriptionOut. `key` is read if the server ever sends the public key with it. */
export const startSubscriptionSchema = z.object({
  razorpay_subscription_id: z.string(),
  checkout_url: z.string().nullish(),
  status: z.string().nullish(),
  key: z.string().nullish(),
});
export type StartSubscription = z.infer<typeof startSubscriptionSchema>;

// ─── Words ──────────────────────────────────────────────────────────────

/** The ten caps, in the order the admin's plan editor lists them. */
export const LIMIT_FIELDS = [
  { key: "events_per_month", label: "Events", unit: "this month" },
  { key: "registrations_per_month", label: "Registrations", unit: "this month, all events" },
  { key: "registrations_per_event", label: "Registrations per event", unit: "for one event" },
  { key: "ticket_types_per_event", label: "Ticket types", unit: "per event" },
  { key: "coupons_per_event", label: "Coupon codes", unit: "per event" },
  { key: "merch_items_per_event", label: "Merchandise items", unit: "per event" },
  { key: "committee_seats", label: "Committee seats", unit: "logins with roles" },
  { key: "storage_gb", label: "Storage", unit: "GB" },
  { key: "announcements_per_month", label: "Announcements", unit: "this month" },
  { key: "website_templates", label: "Website templates", unit: "to choose from" },
] as const;
export type LimitKey = (typeof LIMIT_FIELDS)[number]["key"];

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<SubscriptionStatus, "info" | "success" | "warning" | "destructive"> = {
  trial: "info",
  active: "success",
  past_due: "warning",
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

export function limitText(cap: number | null | undefined, unit?: string): string {
  if (cap === null || cap === undefined) return "Unlimited";
  if (cap === 0) return "Not included";
  return `Up to ${cap.toLocaleString("en-IN")}${unit ? ` ${unit}` : ""}`;
}

/**
 * Whether Razorpay may already be billing the club, or about to.
 *
 * `/clubs/subscription/start` makes a new Razorpay subscription every time
 * and does not cancel the one before it, so starting another here while one
 * is live would charge the club twice. A trial counts even before its first
 * charge: the club may have authorised it already, and nothing on our side
 * records that until the trial ends.
 */
export function billedByRazorpay(sub: Subscription | null | undefined): boolean {
  return Boolean(sub?.razorpay_subscription_id) && sub?.status !== "cancelled";
}

/** A checkout that was started and never paid for: the same Razorpay subscription can be opened again. */
export function awaitingCheckout(sub: Subscription | null | undefined): boolean {
  return billedByRazorpay(sub) && (sub?.status === "trial" || sub?.status === "past_due") && !sub?.current_period_end && (sub?.mrr_paise ?? 0) === 0;
}
