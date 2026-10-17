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

/** Kinds about a club's subscription rather than the club itself. */
const SUBSCRIPTION_KINDS = new Set<string>(NOTIFICATION_KINDS.filter((k) => k !== "club_applied"));

/**
 * Where a notification leads: the subscription (the Subscribers tab, found
 * by the club's name) for anything about billing, the club for an
 * application, nowhere when it names neither.
 */
export function notificationHref(n: Pick<AdminNotification, "kind" | "club" | "subscription_id">): string | null {
  if (n.club && (n.subscription_id != null || SUBSCRIPTION_KINDS.has(n.kind))) {
    return `/subscriptions?q=${encodeURIComponent(n.club.name)}`;
  }
  if (n.club) return `/clubs/${n.club.id}`;
  return null;
}
