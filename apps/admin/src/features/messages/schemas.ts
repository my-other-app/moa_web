import { z } from "zod";

/**
 * A club's emails and WhatsApp messages against its plan's monthly
 * allowance, then its bought credits; its closed months and, on Enterprise,
 * its own limits.
 *
 * Prepaid credits retired per-message overage billing: nothing past the
 * allowance is charged any more. A closed month from before says what became
 * of its extra ("charged" before credits, "void" when the extra was cancelled
 * on retirement). Money is paise on the wire.
 */

export const CHANNELS = ["email", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];

const channelUsageSchema = z.object({
  used: z.number().catch(0),
  limit: z.number().nullable().catch(null),
  extra: z.number().catch(0),
  blocked: z.number().catch(0),
  rate_paise: z.number().catch(0),
  extra_paise: z.number().catch(0),
  percent: z.number().nullable().catch(null),
  state: z.string().catch("ok"),
  kinds: z.record(z.string(), z.number()).catch({}),
  warned: z.array(z.number()).catch([]),
  // Prepaid credits (absent from a server before them).
  plan_used: z.number().nullish().catch(null),
  plan_remaining: z.number().nullish().catch(null),
  credits_used: z.number().nullish().catch(null),
  credits_remaining: z.number().nullish().catch(null),
  over: z.number().nullish().catch(null),
  total_remaining: z.number().nullish().catch(null),
});
export type ChannelUsage = z.infer<typeof channelUsageSchema>;

export const usageSchema = z.object({
  period: z.string(),
  period_label: z.string(),
  plan_key: z.string().nullish(),
  plan_name: z.string().nullish(),
  /** prepaid (now); razorpay | manual | none from a server before credits */
  billing: z.string().catch("none"),
  blocks_past_limit: z.boolean().catch(false),
  custom: z.boolean().catch(false),
  trial: z.string().nullish().catch(null),
  channels: z.object({ email: channelUsageSchema, whatsapp: channelUsageSchema }),
  estimated_extra_paise: z.number().catch(0),
});
export type Usage = z.infer<typeof usageSchema>;

const statementChannelSchema = z.object({
  used: z.number().catch(0),
  limit: z.number().nullable().catch(null),
  extra: z.number().catch(0),
  rate_paise: z.number().catch(0),
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
  razorpay_addon_id: z.string().nullish(),
});
export type Statement = z.infer<typeof statementSchema>;

export const ownLimitsSchema = z.object({
  emails_per_month: z.number().nullable().catch(null),
  whatsapp_per_month: z.number().nullable().catch(null),
  email_overage_paise: z.number().nullable().catch(null),
  whatsapp_overage_paise: z.number().nullable().catch(null),
  note: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type OwnLimits = z.infer<typeof ownLimitsSchema>;

export const clubMessagesSchema = z.object({
  club_id: z.coerce.number(),
  club_name: z.string(),
  usage: usageSchema,
  history: z.array(statementSchema).catch([]),
  own_limits: ownLimitsSchema.nullish().catch(null),
  /** Own limits apply only while the club is on Enterprise. */
  own_limits_apply: z.boolean().catch(false),
});
export type ClubMessages = z.infer<typeof clubMessagesSchema>;

// ─── Words ──────────────────────────────────────────────────────────────

export const STATEMENT_LABEL: Record<string, string> = {
  void: "Not charged (overage retired)",
  nothing_due: "Nothing extra",
  pending: "To charge",
  charging: "Charging",
  charged: "On next invoice",
  failed: "Razorpay refused · retrying",
  unconfirmed: "Checking with Razorpay",
  gave_up: "Invoice by hand",
  manual: "Invoice by hand",
  not_billable: "Not billable",
  waived: "Under ₹1 · waived",
};

export const STATEMENT_TONE: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  void: "default",
  nothing_due: "default",
  pending: "info",
  charging: "info",
  charged: "success",
  failed: "warning",
  unconfirmed: "warning",
  gave_up: "destructive",
  manual: "destructive",
  not_billable: "default",
  waived: "default",
};

export const BILLING_LABEL: Record<string, string> = {
  prepaid: "Plan allowance, then bought credits; with none left, announcements and reminders are held back (tickets always go, never charged)",
  razorpay: "Extra went on the club's Razorpay invoice (before prepaid credits)",
  manual: "Extra was invoiced by hand (before prepaid credits)",
  none: "No payment method (Free or the free trial): past the limit, announcements and reminders are held back",
};

/** ₹0.10, ₹1, ₹2,345.50. */
export function paiseText(paise: number): string {
  const r = paise / 100;
  return `₹${r.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "1,240 / 5,000", "1,240 / no limit". */
export function usedOf(c: { used: number; limit: number | null }): string {
  return `${c.used.toLocaleString("en-IN")} / ${c.limit === null ? "no limit" : c.limit.toLocaleString("en-IN")}`;
}

// ─── The own-limits form ────────────────────────────────────────────────

/** Text boxes: empty is unlimited. (Per-message prices were retired with prepaid credits.) */
export interface OwnLimitsForm {
  emails: string;
  whatsapp: string;
  note: string;
}

export function toOwnLimitsForm(own: OwnLimits | null | undefined): OwnLimitsForm {
  return {
    emails: own?.emails_per_month === null || own?.emails_per_month === undefined ? "" : String(own.emails_per_month),
    whatsapp: own?.whatsapp_per_month === null || own?.whatsapp_per_month === undefined ? "" : String(own.whatsapp_per_month),
    note: own?.note ?? "",
  };
}

/** What is wrong with the form, field by field (empty when nothing is). */
export function ownLimitsProblems(form: OwnLimitsForm): Partial<Record<keyof OwnLimitsForm, string>> {
  const out: Partial<Record<keyof OwnLimitsForm, string>> = {};
  for (const key of ["emails", "whatsapp"] as const) {
    const v = form[key].trim();
    if (v && !/^\d+$/.test(v)) out[key] = "A whole number, or empty for no limit";
  }
  if (form.note.length > 200) out.note = "At most 200 characters";
  return out;
}

/** The limits only: the retired per-message prices are not sent (the server ignores them). */
export function toOwnLimitsPayload(form: OwnLimitsForm) {
  const int = (v: string) => (v.trim() === "" ? null : Number.parseInt(v.trim(), 10));
  return {
    emails_per_month: int(form.emails),
    whatsapp_per_month: int(form.whatsapp),
    note: form.note.trim() || null,
  };
}
