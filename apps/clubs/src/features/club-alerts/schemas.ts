import { z } from "zod";

/**
 * What MyOtherApp tells the club in its dashboard: the bell. Shared by
 * everyone who signs in to the club (the owner and the team).
 *
 * Kinds (club_alerts.service.KINDS on the server):
 * message_quota_80     80% of the plan's monthly emails or WhatsApp messages used
 * message_quota_100    all of the plan's allowance used (bought credits come next)
 * message_credits_low  bought credits under a tenth of the last pack
 * message_credits_expiring  bought credits with some left expire within 30 days
 * message_credits_added  MyOtherApp gave the club free credits
 * whatsapp_failed      the club's own WhatsApp number stopped working
 * whatsapp_quality     its quality rating or messaging limit dropped
 * whatsapp_restricted  Meta restricted its WhatsApp account
 * whatsapp_message     a conversation has unread WhatsApp messages (a name and a count; the inbox's people only)
 * whatsapp_waiting     a WhatsApp conversation has waited too long for an answer (the inbox's people only)
 * mail_message         a conversation in the club's mailbox has unread mail (a name and a count; the Mail permission's people only)
 * mailbox_lapsed       the plan no longer includes the mailbox: closed, its mail readable 30 days
 * mailbox_expired      those 30 days are over: export or delete the mail
 */
export const clubAlertSchema = z.object({
  id: z.coerce.number(),
  kind: z.string(),
  title: z.string(),
  body: z.string().catch(""),
  /** Where in the dashboard it leads ("/billing"), or null. */
  link: z.string().nullish().catch(null),
  data: z.record(z.string(), z.unknown()).catch({}),
  created_at: z.string(),
  read: z.boolean().catch(false),
});
export type ClubAlert = z.infer<typeof clubAlertSchema>;

export const clubAlertsSchema = z.object({
  items: z.array(clubAlertSchema).catch([]),
  unread: z.number().catch(0),
});
export type ClubAlerts = z.infer<typeof clubAlertsSchema>;

/** A link the bell may follow: a dashboard path, never somewhere else. */
export function safeLink(link: string | null | undefined): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}

export type AlertTone = "caution" | "refuse" | "info";

/**
 * What each kind is about, as the bell labels it, and where it leads when
 * the notice names no page of its own. A kind this build does not know is
 * shown with its title alone.
 */
export const KIND_INFO: Record<string, { label: string; link: string; tone: AlertTone }> = {
  message_quota_80: { label: "Messages", link: "/billing#credits", tone: "caution" },
  message_quota_100: { label: "Messages", link: "/billing#credits", tone: "refuse" },
  message_credits_low: { label: "Credits", link: "/billing#credits", tone: "caution" },
  message_credits_expiring: { label: "Credits", link: "/billing#credits", tone: "caution" },
  message_credits_added: { label: "Credits", link: "/billing#credits", tone: "info" },
  whatsapp_failed: { label: "WhatsApp number", link: "/whatsapp/settings", tone: "refuse" },
  whatsapp_quality: { label: "WhatsApp quality", link: "/whatsapp/settings", tone: "caution" },
  whatsapp_restricted: { label: "WhatsApp account", link: "/whatsapp/settings", tone: "refuse" },
  whatsapp_message: { label: "WhatsApp message", link: "/whatsapp", tone: "info" },
  whatsapp_waiting: { label: "WhatsApp: waiting for an answer", link: "/whatsapp", tone: "caution" },
  mail_message: { label: "Mail", link: "/mail", tone: "info" },
  mailbox_lapsed: { label: "Club mailbox", link: "/mail/settings", tone: "caution" },
  mailbox_expired: { label: "Club mailbox", link: "/mail/settings", tone: "refuse" },
};

/**
 * Where a notice leads: the page it names, when that is a dashboard path
 * (one that is not is never followed); with none named, its kind's page.
 */
export function alertLink(a: Pick<ClubAlert, "kind" | "link">): string | null {
  if (a.link) return safeLink(a.link);
  return KIND_INFO[a.kind]?.link ?? null;
}

/** The short call to action a notice carries ("Buy credits"), when the server sends one. */
export function actionLabel(a: Pick<ClubAlert, "data">): string | null {
  const label = a.data?.action_label;
  return typeof label === "string" && label.trim() ? label.trim().slice(0, 40) : null;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function ago(iso: string, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}
