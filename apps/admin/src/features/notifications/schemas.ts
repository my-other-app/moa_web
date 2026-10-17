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
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * The colour a kind reads in: money in, a failure, a clock running, a club
 * asking, a change of plan, an ending.
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
};

/** A kind this build has a word for, else the server's own, readable. */
export function kindLabel(kind: string): string {
  return (KIND_META as Record<string, { label: string }>)[kind]?.label ?? kind.replace(/_/g, " ");
}

export function kindTone(kind: string): KindTone {
  return (KIND_META as Record<string, { tone: KindTone }>)[kind]?.tone ?? "change";
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
  if (n.kind === "payment_gateway_disconnected") {
    // Who took it off, when the alert says: the club itself, or an admin disabling it.
    const by = text(data.by);
    if (by === "admin") return "Razorpay disabled by an admin";
    if (by === "club") return "Razorpay disconnected by the club";
  }
  return kindLabel(n.kind);
}

/** Kinds about a club's own Razorpay account: they lead to the club. */
export const GATEWAY_KINDS = new Set<string>(["payment_gateway_connected", "payment_gateway_failed", "payment_gateway_disconnected"]);

/** Kinds about a club's subscription rather than the club itself. */
const SUBSCRIPTION_KINDS = new Set<string>(NOTIFICATION_KINDS.filter((k) => k !== "club_applied" && !GATEWAY_KINDS.has(k)));

/**
 * Where a notification leads: the subscription (the Subscribers tab, found
 * by the club's name) for anything about billing, the club for an
 * application or its own Razorpay account, nowhere when it names neither.
 */
export function notificationHref(n: Pick<AdminNotification, "kind" | "club" | "subscription_id">): string | null {
  if (n.club && GATEWAY_KINDS.has(n.kind)) return `/clubs/${n.club.id}`;
  if (n.club && (n.subscription_id != null || SUBSCRIPTION_KINDS.has(n.kind))) {
    return `/subscriptions?q=${encodeURIComponent(n.club.name)}`;
  }
  if (n.club) return `/clubs/${n.club.id}`;
  return null;
}
