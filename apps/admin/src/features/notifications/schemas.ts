import { z } from "zod";

/**
 * What the platform tells its admins: a club applying, money arriving, a
 * charge failing, a grace period running out. One row per happening, read
 * or not; reading one marks it read for every admin.
 */
export const NOTIFICATION_KINDS = [
  "club_applied",
  "subscription_trial_started",
  "subscription_activated",
  "payment_received",
  "payment_failed",
  "subscription_past_due",
  "grace_started",
  "grace_ending",
  "subscription_downgraded",
  "subscription_paused",
  "subscription_resumed",
  "subscription_cancelled",
  "plan_assigned",
  "payment_gateway_connected",
  "payment_gateway_failed",
  "payment_gateway_disconnected",
  "comp_ending",
  "comp_ended",
  "club_domain_active",
  "content_reported",
  // Wave 1: money that needs a look, and mail given up on.
  "payment_unapplied",
  "payment_auto_refunded",
  "payment_refund_failed",
  "store_oversold",
  "subscription_orphan_charged",
  "email_dead_letter",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * The colour a kind reads in: money in, a failure (or a report wanting a
 * decision), a clock running, a club asking, a change of plan, an ending.
 */
export type KindTone = "money" | "failure" | "grace" | "application" | "change" | "ended";

export const KIND_META: Record<NotificationKind, { label: string; tone: KindTone }> = {
  club_applied: { label: "Club applied", tone: "application" },
  subscription_trial_started: { label: "Trial started", tone: "change" },
  subscription_activated: { label: "Subscription active", tone: "money" },
  payment_received: { label: "Payment received", tone: "money" },
  payment_failed: { label: "Payment failed", tone: "failure" },
  subscription_past_due: { label: "Past due", tone: "failure" },
  grace_started: { label: "Grace started", tone: "grace" },
  grace_ending: { label: "Grace ending", tone: "grace" },
  subscription_downgraded: { label: "Downgraded", tone: "ended" },
  subscription_paused: { label: "Paused", tone: "grace" },
  subscription_resumed: { label: "Resumed", tone: "money" },
  subscription_cancelled: { label: "Cancelled", tone: "ended" },
  plan_assigned: { label: "Plan assigned", tone: "change" },
  // A club's own Razorpay: its ticket money now goes to the club, its keys stopped working, or it went back to ours.
  payment_gateway_connected: { label: "Razorpay connected", tone: "money" },
  payment_gateway_failed: { label: "Razorpay check failed", tone: "failure" },
  payment_gateway_disconnected: { label: "Razorpay disconnected", tone: "ended" },
  comp_ending: { label: "Free plan ending", tone: "grace" },
  comp_ended: { label: "Free plan ended", tone: "ended" },
  // A club's website went live on a domain of its own.
  club_domain_active: { label: "Club domain live", tone: "change" },
  // An app user reported a thread, a comment, a person or a club: it wants a decision on the Reports page.
  content_reported: { label: "Content reported", tone: "failure" },
  // A captured ticket payment that never marked its registration paid; the sweep applied it, or could not (data.repaired).
  payment_unapplied: { label: "Payment not applied", tone: "failure" },
  // A payment handed back on its own: the event filled while it was paid, or an order paid twice (data.reason).
  payment_auto_refunded: { label: "Refunded automatically", tone: "change" },
  // Razorpay did not take an automatic refund; the sweep keeps trying.
  payment_refund_failed: { label: "Refund failed", tone: "failure" },
  // A guest paid for store pieces that had sold out: the organiser hands something over or refunds.
  store_oversold: { label: "Store oversold", tone: "failure" },
  // Razorpay charged a subscription no club holds; it was cancelled there.
  subscription_orphan_charged: { label: "Charge on an unknown subscription", tone: "failure" },
  // An event's emails were given up on after every retry.
  email_dead_letter: { label: "Emails failed after retries", tone: "failure" },
};

/**
 * `plan_assigned` carrying `data.complimentary`: an admin gave the plan
 * free. Shown as a kind of its own (its word and its mark), though the
 * server files it under plan_assigned.
 */
export const FREE_PLAN_GIVEN = "free_plan_given";

/** The kind an alert reads as: its own, or "free plan given" for a plan given free. */
export function displayKind(n: Pick<AdminNotification, "kind" | "data">): string {
  if (n.kind === "plan_assigned" && n.data?.complimentary === true && n.data?.action !== "extend_grace") return FREE_PLAN_GIVEN;
  return n.kind;
}

const DISPLAY_META: Record<string, { label: string; tone: KindTone }> = {
  ...KIND_META,
  [FREE_PLAN_GIVEN]: { label: "Free plan given", tone: "change" },
};

/** A kind this build has a word for, else the server's own, readable. */
export function kindLabel(kind: string): string {
  return DISPLAY_META[kind]?.label ?? kind.replace(/_/g, " ");
}

export function kindTone(kind: string): KindTone {
  return DISPLAY_META[kind]?.tone ?? "change";
}

export const notificationSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  /* Kept as the server says it: a kind this build does not know still shows. */
  kind: z.string(),
  title: z.string(),
  body: z.string().nullish(),
  club: z.object({ id: z.coerce.number(), name: z.string(), slug: z.string().nullish() }).nullish(),
  subscription_id: z.coerce.number().nullish(),
  data: z.record(z.string(), z.unknown()).nullish().catch(null),
  created_at: z.string(),
  read_at: z.string().nullish(),
});
export type AdminNotification = z.infer<typeof notificationSchema>;

export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  total: z.number().catch(0),
  unread: z.number().catch(0),
});
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const unreadCountSchema = z.object({ unread: z.number().catch(0) });

/** POST /admin/alerts/read-all: how many it marked, and how many are still unread. */
export const readAllSchema = z.object({ updated: z.number().catch(0), unread: z.number().catch(0) });

/** "growth" → "Growth", "pro_2025" → "Pro 2025": a plan key, readable, when the alert carries no name. */
function planWords(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const CANCELLED_BY: Record<string, string> = {
  club: "by the club",
  admin: "by an admin",
  razorpay: "by Razorpay",
  razorpay_completed: "by Razorpay, its billing cycles done",
};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * What the alert's kind says, with what its `data` adds: the plan a club
 * applied for, who cancelled, a plan change that was really more grace.
 */
export function alertLabel(n: Pick<AdminNotification, "kind" | "data">): string {
  const data = n.data ?? {};
  if (n.kind === "club_applied") {
    const plan = text(data.requested_plan);
    const cycle = text(data.requested_cycle);
    return plan ? `Club applied · wants ${planWords(plan)}${cycle ? ` (${cycle})` : ""}` : kindLabel(n.kind);
  }
  if (n.kind === "subscription_cancelled") {
    const by = text(data.by);
    return by ? `Cancelled ${CANCELLED_BY[by] ?? `by ${by.replace(/_/g, " ")}`}` : kindLabel(n.kind);
  }
  if (n.kind === "plan_assigned" && data.action === "extend_grace") return "Grace extended";
  if (n.kind === "payment_gateway_connected" && text(data.by) === "admin") return "Razorpay re-enabled by an admin";
  if (n.kind === "payment_gateway_disconnected") {
    // Who took it off, when the alert says: the club itself, or an admin disabling it.
    const by = text(data.by);
    if (by === "admin") return "Razorpay disabled by an admin";
    if (by === "club") return "Razorpay disconnected by the club";
  }
  // The domain, when the alert carries it.
  if (n.kind === "club_domain_active" && text(data.host)) return `Club domain live · ${text(data.host)}`;
  if (n.kind === "content_reported") {
    // What was reported and why, and how many people have: "Content reported · comment · harassment · 3 reports".
    const parts = [text(data.target_type), text(data.reason)].filter((p): p is string => Boolean(p)).map((p) => p.replace(/_/g, " "));
    const count = typeof data.report_count === "number" && data.report_count > 1 ? `${data.report_count} reports` : null;
    return [kindLabel(n.kind), ...parts, ...(count ? [count] : [])].join(" · ");
  }
  if (n.kind === "payment_unapplied" && typeof data.repaired === "boolean") {
    return data.repaired ? "Payment not applied · applied by the sweep" : "Payment not applied · still unpaid";
  }
  if (n.kind === "payment_auto_refunded") {
    const reason = text(data.reason);
    if (reason === "event_full") return "Refunded automatically · the event was full";
    if (reason === "duplicate") return "Refunded automatically · paid twice";
  }
  if (displayKind(n) === FREE_PLAN_GIVEN) {
    const plan = text(data.plan_name) ?? (text(data.plan) ? planWords(text(data.plan)!) : null);
    return plan ? `Free plan given · ${plan}` : kindLabel(FREE_PLAN_GIVEN);
  }
  return kindLabel(n.kind);
}

/** Kinds about a club's own Razorpay account: they lead to the club. */
export const GATEWAY_KINDS = new Set<string>(["payment_gateway_connected", "payment_gateway_failed", "payment_gateway_disconnected"]);

/**
 * Kinds about the club itself rather than its plan -- its Razorpay, its
 * domain, its store, its emails: they lead to the club.
 */
const CLUB_KINDS = new Set<string>([...GATEWAY_KINDS, "club_domain_active", "store_oversold", "email_dead_letter"]);

/** Kinds that are not about the club or its money, and lead to a page of their own. */
const KIND_PAGES: Record<string, string> = { content_reported: "/reports" };

/** Kinds about one ticket payment: they lead to it on the Payments page, found by its Razorpay id. */
const PAYMENT_KINDS = new Set<string>(["payment_unapplied", "payment_auto_refunded", "payment_refund_failed"]);

/** Kinds about a club's subscription rather than the club itself. */
const SUBSCRIPTION_KINDS = new Set<string>(NOTIFICATION_KINDS.filter((k) => k !== "club_applied" && !CLUB_KINDS.has(k) && !PAYMENT_KINDS.has(k) && !(k in KIND_PAGES)));

/**
 * Where a notification leads: a report to the Reports page, a ticket
 * payment to the Payments page (searched by its Razorpay id), the
 * subscription (the Subscribers tab, found by the club's name) for
 * anything about billing, the club for an application, its own Razorpay
 * account or its domain, nowhere when it names neither.
 */
export function notificationHref(n: Pick<AdminNotification, "kind" | "club" | "subscription_id"> & { data?: AdminNotification["data"] }): string | null {
  if (KIND_PAGES[n.kind]) return KIND_PAGES[n.kind]!;
  if (PAYMENT_KINDS.has(n.kind)) {
    const id = text(n.data?.payment_id) ?? text(n.data?.razorpay_order_id);
    return id ? `/payments?q=${encodeURIComponent(id)}` : "/payments";
  }
  if (n.club && CLUB_KINDS.has(n.kind)) return `/clubs/${n.club.id}`;
  if (n.club && (n.subscription_id != null || SUBSCRIPTION_KINDS.has(n.kind))) {
    return `/subscriptions?q=${encodeURIComponent(n.club.name)}`;
  }
  if (n.club) return `/clubs/${n.club.id}`;
  return null;
}
