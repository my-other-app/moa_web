import { z } from "zod";

/**
 * Emails and WhatsApp messages a club sends in a month: its plan's allowance
 * first, then the credits it bought.
 *
 * Every message to the club's people counts: tickets, certificates, payment
 * messages, reminders, announcements, campaigns, journey emails, surveys —
 * by email, and by WhatsApp through the platform's number. Each month the
 * plan's allowance is used first; past it, sends draw on bought credits
 * (packs paid for once, lasting 12 months). With nothing left, announcements,
 * campaigns and reminders pause, while tickets, certificates and payment
 * messages always go and are never charged. Nothing is billed per extra
 * message any more.
 *
 * A server from before prepaid credits sends no plan / credits split:
 * the card then shows the month's count against the limit, as it did.
 */

export const CHANNELS = ["email", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * unlimited     no monthly limit
 * not_included  a limit of 0, no credits and nothing sent (Free has no WhatsApp)
 * ok            under 80% of the plan's allowance
 * near          80% or more of it
 * credits       the plan's allowance is used: sending on bought credits
 * blocked       nothing left: announcements, campaigns and reminders are held back
 * over          (a server from before credits) past the limit, still sending
 */
export const STATES = ["unlimited", "not_included", "ok", "near", "credits", "over", "blocked"] as const;
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
  /**
   * WhatsApp only: of the month's messages, the promotional (marketing)
   * ones, against the plan's cap on them (20% of its WhatsApp). Past it a
   * promotional message is held back on every plan; tickets, certificates
   * and reminders always go. Absent from a server before the cap.
   */
  marketing: z.object({ used: z.number().catch(0), limit: z.number().nullable().catch(null) }).nullish().catch(null),
  // Prepaid credits (absent from a server before them):
  /** Of `used`, the ones the plan's allowance covered, and what is left of it (null: unlimited). */
  plan_used: z.number().nullish().catch(null),
  plan_remaining: z.number().nullish().catch(null),
  /** Of `used`, the ones bought credits paid for, and the bought credits left. */
  credits_used: z.number().nullish().catch(null),
  credits_remaining: z.number().nullish().catch(null),
  /** Tickets, certificates and payment messages sent with nothing left: never charged. */
  over: z.number().nullish().catch(null),
  /** The plan's left plus bought credits left (null: unlimited). */
  total_remaining: z.number().nullish().catch(null),
});
export type ChannelUsage = z.infer<typeof channelUsageSchema>;

/**
 * prepaid: the plan's allowance, then bought credits; nothing is billed per
 * message. From a server before credits: razorpay / manual (the extra was
 * billed) and none (Free, the free trial).
 */
export const BILLING = ["prepaid", "razorpay", "manual", "none"] as const;
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
  /** Prepaid credits: the month's split (absent from older months and servers). */
  plan_used: z.number().nullish().catch(null),
  credits_used: z.number().nullish().catch(null),
  over: z.number().nullish().catch(null),
  blocked: z.number().nullish().catch(null),
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

/** Whether the server counts by plan allowance and bought credits. */
export function isPrepaid(u: Pick<MessageUsage, "billing">): boolean {
  return u.billing === "prepaid";
}

const num = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN");

/** "950 of 1,000" (the plan's allowance), "1,240 sent · no limit", "Not included". */
export function usedLine(c: ChannelUsage): string {
  const used = num(c.used);
  if (c.limit === null) return `${used} sent · no limit`;
  if (c.limit === 0) return c.used === 0 ? "Not included" : `${used} sent · none on your plan`;
  return `${num(c.plan_used ?? c.used)} of ${c.limit.toLocaleString("en-IN")}`;
}

export function barTone(state: UsageState): "accent" | "caution" | "refuse" {
  if (state === "blocked") return "refuse";
  if (state === "near" || state === "over" || state === "credits") return "caution";
  return "accent";
}

/**
 * Plan, then bought, then the total left: the three figures under a
 * channel's bar on a prepaid server. Null from a server before credits.
 */
export function remainingLines(u: MessageUsage, channel: Channel): { plan: string; bought: string; total: string } | null {
  if (!isPrepaid(u)) return null;
  const c = u.channels[channel];
  const plan = c.limit === null ? "No limit" : c.limit === 0 ? "Not included" : `${num(c.plan_remaining)} of ${c.limit.toLocaleString("en-IN")} left`;
  return {
    plan,
    bought: `${num(c.credits_remaining)} left`,
    total: c.total_remaining === null || c.total_remaining === undefined ? (c.limit === null ? "No limit" : `${num(c.credits_remaining)} left`) : `${num(c.total_remaining)} left`,
  };
}

/** The line under a channel's bar: where its messages come from now, or why sends stopped. */
export function extraLine(u: MessageUsage, channel: Channel): string | null {
  const c = u.channels[channel];
  const held = c.blocked ? ` ${num(c.blocked)} held back so far.` : "";
  if (isPrepaid(u)) {
    const essentials = c.over ? ` ${num(c.over)} tickets, certificates or payment messages went anyway, never charged.` : "";
    if (c.state === "blocked") {
      return channel === "whatsapp" && c.limit === 0
        ? `WhatsApp isn't included on your plan and you have no WhatsApp credits: reminders and announcements wait. Tickets and certificates still go.${held}${essentials}`
        : `Plan allowance and bought credits used up: announcements, campaigns and reminders are paused until next month, or until you buy credits. Tickets and certificates still go.${held}${essentials}`;
    }
    if (c.state === "credits") {
      const left = `${num(c.credits_remaining)} left`;
      return c.limit === 0
        ? `Sending on bought credits: ${left}.`
        : `Your plan's ${num(c.limit)} ${channelName(channel, c.limit ?? 0)} for ${u.period_label} are used; sending on bought credits (${left}).`;
    }
    if (c.state === "near" && c.limit !== null) {
      return (c.credits_remaining ?? 0) > 0
        ? `${num(c.plan_remaining)} left on your plan this month; then your bought credits are used.`
        : `${num(c.plan_remaining)} left on your plan this month. Then announcements and reminders pause unless you buy credits; tickets still go.`;
    }
    return null;
  }
  // A server from before prepaid credits: the count against the limit, nothing about money.
  if (c.state === "blocked") {
    return channel === "whatsapp" && c.limit === 0
      ? `WhatsApp reminders aren't included on your plan; tickets and certificates still go.${held}`
      : `Limit reached: announcements, campaigns and reminders are paused until next month. Tickets and certificates still go.${held}`;
  }
  if (c.extra > 0) return `${num(c.extra)} past your plan's allowance this month`;
  if (c.state === "near" && c.limit !== null) {
    const left = Math.max(0, c.limit - c.used).toLocaleString("en-IN");
    return u.blocks_past_limit ? `${left} left this month. Past the limit, announcements and reminders pause; tickets still go.` : `${left} left this month.`;
  }
  return null;
}

/**
 * "Promotional: 12 of 200 this month", or why they stopped: under the
 * WhatsApp bar, once the plan caps promotional messages. Null without a cap,
 * or when the plan has no WhatsApp.
 */
export function promotionalLine(c: ChannelUsage): string | null {
  const m = c.marketing;
  if (!m || m.limit === null || c.limit === 0) return null;
  if (m.limit === 0) return "Promotional WhatsApp isn't included on your plan; tickets, certificates and reminders still go.";
  const counted = `Promotional: ${m.used.toLocaleString("en-IN")} of ${m.limit.toLocaleString("en-IN")} this month`;
  return m.used >= m.limit
    ? `${counted}. More promotional messages use bought credits, or wait for next month; tickets, certificates and reminders still go.`
    : `${counted}.`;
}

/** What happens past the plan's allowance, in one sentence for the card's foot. */
export function policyLine(u: MessageUsage): string {
  if (isPrepaid(u)) {
    return "Your plan's monthly allowance is used first, then bought credits. With none left, announcements, campaigns and reminders pause until next month; tickets, certificates and payment messages always go and are never charged.";
  }
  if (u.billing === "none") {
    return u.trial === "free_trial"
      ? "Your free trial has no card to charge: past the limit, announcements, campaigns and reminders pause. Tickets, certificates and payment messages always go."
      : "Free has no card to charge: past the limit, announcements, campaigns and reminders pause until next month. Tickets, certificates and payment messages always go.";
  }
  return "Past your plan's allowance, messages keep going this month.";
}

/** Whether an "Upgrade" belongs on the card: something is near, past or held back, and a plan has room. */
export function wantsUpgrade(u: MessageUsage): boolean {
  if (!u.upgrade) return false;
  return CHANNELS.some((ch) => ["near", "over", "credits", "blocked"].includes(u.channels[ch].state));
}

/** Whether "Buy credits" belongs on the card: a prepaid server, and something is near, on credits or held back. */
export function wantsCredits(u: MessageUsage): boolean {
  if (!isPrepaid(u)) return false;
  return CHANNELS.some((ch) => ["near", "credits", "blocked"].includes(u.channels[ch].state));
}

/** A closed month's line: "5,400 emails (400 on bought credits) · 12 WhatsApp". */
export function historyLine(s: Statement): string {
  const part = (ch: Channel) => {
    const c = s[ch];
    const bought = c.credits_used ? ` (${num(c.credits_used)} on bought credits)` : "";
    return ch === "email" ? `${num(c.used)} ${channelName("email", c.used)}${bought}` : `${num(c.used)} WhatsApp${bought}`;
  };
  return `${part("email")} · ${part("whatsapp")}`;
}

/**
 * What became of a closed month. Months are only counted now; "charged" is
 * a month billed before prepaid credits, and "void" one whose extra was
 * cancelled when per-message billing was retired.
 */
export const STATEMENT_LABEL: Record<string, string> = {
  nothing_due: "Closed",
  void: "Not charged",
  charged: "Charged before credits",
  pending: "Not charged",
  charging: "Not charged",
  failed: "Not charged",
  unconfirmed: "Not charged",
  gave_up: "Not charged",
  manual: "Not charged",
  not_billable: "Not charged",
  waived: "Not charged",
};
