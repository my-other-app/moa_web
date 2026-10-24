import { z } from "zod";

/**
 * Emails and WhatsApp messages a club sends in a month, against its plan.
 *
 * Every message to the club's people counts: tickets, certificates, payment
 * messages, reminders, announcements, campaigns, journey emails, surveys —
 * by email, and by WhatsApp through the platform's number. Past the limit a
 * plan Razorpay bills keeps sending and pays per extra message on its next
 * bill; Free (and the free trial) has no card to charge, so announcements,
 * campaigns and reminders stop there while tickets and certificates still go.
 *
 * Money is paise on the wire, as everywhere in the dashboard.
 */

export const CHANNELS = ["email", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * unlimited     no monthly limit
 * not_included  a limit of 0 and nothing sent (Free has no WhatsApp)
 * ok            under 80%
 * near          80% or more
 * over          past the limit, still sending (extra is billed)
 * blocked       past the limit on a plan that holds sends back (Free)
 */
export const STATES = ["unlimited", "not_included", "ok", "near", "over", "blocked"] as const;
export type UsageState = (typeof STATES)[number];

export const channelUsageSchema = z.object({
  used: z.number().catch(0),
  /** null is unlimited, 0 none included. */
  limit: z.number().nullable().catch(null),
  extra: z.number().catch(0),
  /** Sends held back this month (Free past its limit). */
  blocked: z.number().catch(0),
  rate_paise: z.number().catch(0),
  /** What the extra comes to so far; 0 on Free, which is never billed. */
  extra_paise: z.number().catch(0),
  percent: z.number().nullable().catch(null),
  state: z.enum(STATES).catch("ok"),
  kinds: z.record(z.string(), z.number()).catch({}),
  warned: z.array(z.number()).catch([]),
});
export type ChannelUsage = z.infer<typeof channelUsageSchema>;

/** razorpay: the extra goes on the next bill. manual: on a statement the team sends. none: no card (Free, the free trial). */
export const BILLING = ["razorpay", "manual", "none"] as const;
export type Billing = (typeof BILLING)[number];

export const messageUsageSchema = z.object({
  period: z.string(),
  period_label: z.string(),
  period_start: z.string().nullish(),
  period_end: z.string().nullish(),
  plan_key: z.string().nullish(),
  plan_name: z.string().nullish(),
  billing: z.enum(BILLING).catch("none"),
  blocks_past_limit: z.boolean().catch(false),
  custom: z.boolean().catch(false),
  trial: z.string().nullish().catch(null),
  channels: z.object({ email: channelUsageSchema, whatsapp: channelUsageSchema }),
  estimated_extra_paise: z.number().catch(0),
  upgrade: z
    .object({
      plan_key: z.string(),
      plan_name: z.string(),
      contact_sales: z.boolean().catch(false),
      limits: z.record(z.string(), z.number().nullable()).catch({}),
    })
    .nullish()
    .catch(null),
});
export type MessageUsage = z.infer<typeof messageUsageSchema>;

const statementChannelSchema = z.object({
  used: z.number().catch(0),
  limit: z.number().nullable().catch(null),
  extra: z.number().catch(0),
  rate_paise: z.number().catch(0),
});

export const statementSchema = z.object({
  id: z.coerce.number(),
  period: z.string(),
  period_label: z.string(),
  plan_key: z.string().nullish(),
  billing: z.string(),
  email: statementChannelSchema,
  whatsapp: statementChannelSchema,
  amount_paise: z.number().catch(0),
  status: z.string(),
  charged_at: z.string().nullish(),
});
export type Statement = z.infer<typeof statementSchema>;

export const historySchema = z.object({ items: z.array(statementSchema).catch([]) });

// ─── Words ──────────────────────────────────────────────────────────────

const WHOLE = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const EXACT = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹0.10, ₹1, ₹2,345.50: a message's price or an extra, to the paisa. */
export function paiseText(paise: number): string {
  return paise % 100 === 0 ? WHOLE.format(paise / 100) : EXACT.format(paise / 100);
}

export function channelName(channel: Channel, n?: number): string {
  if (channel === "email") return n === 1 ? "email" : "emails";
  return n === 1 ? "WhatsApp message" : "WhatsApp messages";
}

export const CHANNEL_TITLE: Record<Channel, string> = { email: "Emails", whatsapp: "WhatsApp" };

/** "1,240 of 5,000", "1,240 sent · no limit", "Not included". */
export function usedLine(c: ChannelUsage): string {
  const used = c.used.toLocaleString("en-IN");
  if (c.limit === null) return `${used} sent · no limit`;
  if (c.limit === 0 && c.used === 0) return "Not included";
  return `${used} of ${c.limit.toLocaleString("en-IN")}`;
}

export function barTone(state: UsageState): "accent" | "caution" | "refuse" {
  if (state === "blocked") return "refuse";
  if (state === "near" || state === "over") return "caution";
  return "accent";
}

/** The line under a channel's bar: the extra so far and what it is estimated to cost, or why sends stopped. */
export function extraLine(u: MessageUsage, channel: Channel): string | null {
  const c = u.channels[channel];
  if (c.state === "blocked") {
    const held = c.blocked ? ` ${c.blocked.toLocaleString("en-IN")} held back so far.` : "";
    return channel === "whatsapp" && c.limit === 0
      ? `WhatsApp reminders aren't included on your plan; tickets and certificates still go.${held}`
      : `Limit reached: announcements, campaigns and reminders are paused until next month. Tickets and certificates still go.${held}`;
  }
  if (c.extra > 0) {
    const extra = `${c.extra.toLocaleString("en-IN")} extra ${channelName(channel, c.extra)}`;
    if (u.billing === "razorpay") return `${extra} · about ${paiseText(c.extra_paise)} on your next bill (${paiseText(c.rate_paise)} each)`;
    if (u.billing === "manual") return `${extra} · on your monthly statement`;
    return extra;
  }
  if (c.state === "near" && c.limit !== null) {
    const left = Math.max(0, c.limit - c.used).toLocaleString("en-IN");
    return u.blocks_past_limit
      ? `${left} left this month. Past the limit, announcements and reminders pause; tickets still go.`
      : `${left} left this month. Past it, each is ${paiseText(c.rate_paise)}.`;
  }
  return null;
}

/** What the plan does past its limits, in one sentence for the card's foot. */
export function policyLine(u: MessageUsage): string {
  if (u.billing === "razorpay") {
    return `Past the limit, messages keep going: ${paiseText(u.channels.email.rate_paise)} an email and ${paiseText(u.channels.whatsapp.rate_paise)} a WhatsApp message, added to your next bill.`;
  }
  if (u.billing === "manual") return "Past the limit, messages keep going; any extra is on your monthly statement from MyOtherApp.";
  return u.trial === "free_trial"
    ? "Your free trial has no card to charge: past the limit, announcements, campaigns and reminders pause. Tickets, certificates and payment messages always go."
    : "Free has no card to charge: past the limit, announcements, campaigns and reminders pause until next month. Tickets, certificates and payment messages always go.";
}

/** Whether an "Upgrade" belongs on the card: something is near, past or held back, and a plan has room. */
export function wantsUpgrade(u: MessageUsage): boolean {
  if (!u.upgrade) return false;
  return CHANNELS.some((ch) => ["near", "over", "blocked"].includes(u.channels[ch].state));
}

export const STATEMENT_LABEL: Record<string, string> = {
  nothing_due: "Nothing extra",
  pending: "Being added to your bill",
  charging: "Being added to your bill",
  charged: "On your next bill",
  failed: "Being added to your bill",
  unconfirmed: "Being added to your bill",
  gave_up: "On a statement from us",
  manual: "On a statement from us",
  not_billable: "Not charged",
  waived: "Under ₹1 · not charged",
};
