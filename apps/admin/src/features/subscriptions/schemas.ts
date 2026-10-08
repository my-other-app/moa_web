import { paginatedSchema } from "@moa/api";
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

/** The ten caps, in the order the editor lists them. */
export const LIMIT_FIELDS = [
  { key: "events_per_month", label: "Events", scope: "per month" },
  { key: "registrations_per_month", label: "Registrations", scope: "per month, all events" },
  { key: "registrations_per_event", label: "Registrations per event", scope: "cap for one event" },
  { key: "ticket_types_per_event", label: "Ticket types", scope: "per event" },
  { key: "coupons_per_event", label: "Coupon codes", scope: "per event" },
  { key: "merch_items_per_event", label: "Merchandise items", scope: "per event" },
  { key: "committee_seats", label: "Committee seats", scope: "separate logins with roles" },
  { key: "storage_gb", label: "Storage", scope: "GB for photos and artwork" },
  { key: "announcements_per_month", label: "Announcements", scope: "per month" },
  { key: "website_templates", label: "Website templates", scope: "to choose from" },
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
  domain: "Custom domain",
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
  /* False when a paid plan has no Razorpay plan behind it. The editor says so
     rather than letting someone publish it and find out at checkout. */
  billable: z.boolean().default(false),
  subscriber_count: z.number().default(0),
  /* null means unlimited, 0 means none allowed -- the two are different and
     the editor has to keep them apart. */
  limits: z.record(z.string(), z.number().nullable()).default({}),
  features: z.record(z.string(), z.boolean()).default({}),
  /* Sent by the API so the editor does not hold a second copy of the grouping
     that can drift from the backend's. */
  feature_groups: z.record(z.string(), z.array(z.string())).default({}),
});

export type Plan = z.infer<typeof planSchema>;

export const planListSchema = z.array(planSchema);

export const subscriptionSchema = z.object({
  id: z.coerce.number(),
  club: z.object({ id: z.coerce.number(), name: z.string() }).nullish(),
  plan: planSchema.nullish(),
  cycle: z.enum(["monthly", "yearly"]).catch("monthly"),
  status: z.enum(["trial", "active", "past_due", "cancelled"]).catch("active"),
  current_period_end: z.string().nullish(),
  mrr_paise: z.number().default(0),
  last_failure_reason: z.string().nullish(),
  razorpay_subscription_id: z.string().nullish(),
});

export type Subscription = z.infer<typeof subscriptionSchema>;
export const subscriptionPageSchema = paginatedSchema(subscriptionSchema);

export const totalsSchema = z.object({
  mrr_paise: z.number().default(0),
  arr_paise: z.number().default(0),
  active_subscriptions: z.number().default(0),
  trialing: z.number().default(0),
  past_due: z.number().default(0),
  cancelled: z.number().default(0),
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
  limits: z.record(z.string(), z.number().nullable()),
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
    limits: { ...plan.limits },
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
    limits: form.limits,
    features: form.features,
  };
}

/** The rule the API enforces, checked here so the form says so before saving. */
export function yearlyPriceProblem(form: PlanFormInput): string | null {
  if (form.price_yearly_rupees > form.price_monthly_rupees * 12) {
    return "The yearly price is more than twelve months of the monthly one.";
  }
  return null;
}
