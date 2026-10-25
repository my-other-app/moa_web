import { z } from "zod";
import { api } from "@moa/app-kit";

/**
 * Prepaid message credits, the admin's side: a club's balance, every lot it
 * has had (bought or granted), its purchases with refunds, free credits
 * granted with a reason, and the packs on sale.
 *
 * Every write needs `manage_money` and is audited by the server. Money is
 * paise on the wire; the forms take rupees. Pack prices include GST, as plan
 * prices do.
 */

export const CREDIT_CHANNELS = ["email", "whatsapp"] as const;
export type CreditChannel = (typeof CREDIT_CHANNELS)[number];

const count = z.number().catch(0);
const when = z.string().nullish().catch(null);

/** An array whose bad items are dropped, rather than failing the whole answer. */
function listOf<T extends z.ZodTypeAny>(item: T) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((rows) =>
      rows.flatMap((row) => {
        const parsed = item.safeParse(row);
        return parsed.success ? [parsed.data as z.infer<T>] : [];
      }),
    );
}

const balanceSchema = z.object({
  plan: z
    .object({ limit: z.number().nullable().catch(null), used: count, remaining: z.number().nullable().catch(null) })
    .catch({ limit: null, used: 0, remaining: null }),
  bought: z
    .object({ remaining: count, next_expiry: when, low: z.boolean().catch(false) })
    .catch({ remaining: 0, next_expiry: null, low: false }),
  total_remaining: z.number().nullable().catch(null),
});
export type ChannelBalance = z.infer<typeof balanceSchema>;

export const LOT_STATUSES = ["active", "used", "expired", "refunded"] as const;

export const adminLotSchema = z.object({
  id: z.coerce.number(),
  channel: z.enum(CREDIT_CHANNELS),
  source: z.enum(["purchase", "grant"]).catch("purchase"),
  quantity: count,
  remaining: count,
  bought_at: when,
  expires_at: when,
  status: z.enum(LOT_STATUSES).catch("active"),
  purchase_id: z.coerce.number().nullish().catch(null),
  reason: z.string().nullish().catch(null),
  granted_by: z.object({ id: z.coerce.number().nullish(), name: z.string().nullish() }).nullish().catch(null),
});
export type AdminLot = z.infer<typeof adminLotSchema>;

export const PURCHASE_STATUSES = ["created", "paid", "refunding", "refund_failed", "refunded"] as const;

export const adminPurchaseSchema = z.object({
  id: z.coerce.number(),
  receipt_number: z.string().catch(""),
  channel: z.enum(CREDIT_CHANNELS).catch("email"),
  quantity: count,
  amount_paise: count,
  currency: z.string().catch("INR"),
  status: z.enum(PURCHASE_STATUSES).catch("created"),
  created_at: when,
  paid_at: when,
  razorpay_order_id: z.string().nullish().catch(null),
  razorpay_payment_id: z.string().nullish().catch(null),
  payment_method: z.string().nullish().catch(null),
  refunded_paise: count,
  refunded_at: when,
  credits_remaining: z.number().nullish().catch(null),
  expires_at: when,
  refund_reason: z.string().nullish().catch(null),
  refund_error: z.string().nullish().catch(null),
  razorpay_refund_id: z.string().nullish().catch(null),
});
export type AdminPurchase = z.infer<typeof adminPurchaseSchema>;

export const clubCreditsSchema = z.object({
  club_id: z.coerce.number(),
  club_name: z.string().catch(""),
  channels: z.object({ email: balanceSchema, whatsapp: balanceSchema }),
  lots: listOf(adminLotSchema),
  purchases: listOf(adminPurchaseSchema),
});
export type ClubCredits = z.infer<typeof clubCreditsSchema>;

export const adminPackSchema = z.object({
  id: z.coerce.number(),
  channel: z.enum(CREDIT_CHANNELS),
  quantity: z.number().int(),
  price_paise: z.number().int(),
  active: z.boolean().catch(true),
  sort_order: z.number().catch(0),
  updated_at: when,
  sold: count,
});
export type AdminPack = z.infer<typeof adminPackSchema>;

export const packsSchema = z.object({
  prices_include_gst: z.boolean().catch(true),
  validity_months: z.number().catch(12),
  packs: listOf(adminPackSchema),
});
export type Packs = z.infer<typeof packsSchema>;

// ─── Calls ───────────────────────────────────────────────────────────────

/** GET /admin/messages/clubs/{id}/credits. */
export async function fetchClubCredits(clubId: number) {
  return clubCreditsSchema.parse(await api.get<unknown>(`/api/v1/admin/messages/clubs/${clubId}/credits`));
}

export interface GrantInput {
  channel: CreditChannel;
  quantity: number;
  reason: string;
  valid_months: number;
}

/** POST /admin/messages/clubs/{id}/credits/grants: free credits, with a reason (audited). */
export async function grantCredits(clubId: number, input: GrantInput) {
  return clubCreditsSchema.parse(await api.post<unknown>(`/api/v1/admin/messages/clubs/${clubId}/credits/grants`, input));
}

/** POST /admin/messages/credits/purchases/{id}/refund: `amount_paise` null is the server's pro-rata of the unused. */
export async function refundPurchase(purchaseId: number, input: { reason: string; amount_paise: number | null }) {
  return adminPurchaseSchema.parse(await api.post<unknown>(`/api/v1/admin/messages/credits/purchases/${purchaseId}/refund`, input));
}

/** GET /admin/messages/packs: every pack, off sale too. */
export async function fetchPacks() {
  return packsSchema.parse(await api.get<unknown>("/api/v1/admin/messages/packs"));
}

export interface PackInput {
  channel: CreditChannel;
  quantity: number;
  price_paise: number;
  active: boolean;
  sort_order: number;
}

export async function createPack(input: PackInput) {
  return adminPackSchema.parse(await api.post<unknown>("/api/v1/admin/messages/packs", input));
}

export async function updatePack(id: number, input: Partial<Omit<PackInput, "channel">>) {
  return adminPackSchema.parse(await api.patch<unknown>(`/api/v1/admin/messages/packs/${id}`, input));
}

// ─── Words and forms ─────────────────────────────────────────────────────

export const CHANNEL_TITLE: Record<CreditChannel, string> = { email: "Email", whatsapp: "WhatsApp" };

/** ₹99, ₹1,599, ₹1.50. */
export function rupeesText(paise: number): string {
  const r = paise / 100;
  return `₹${r.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export const LOT_LABEL: Record<AdminLot["status"], string> = { active: "Active", used: "Used up", expired: "Expired", refunded: "Refunded" };
export const LOT_TONE: Record<AdminLot["status"], "default" | "success" | "warning" | "destructive" | "info"> = {
  active: "success",
  used: "default",
  expired: "warning",
  refunded: "default",
};

export const PURCHASE_LABEL: Record<AdminPurchase["status"], string> = {
  created: "Not paid",
  paid: "Paid",
  refunding: "Refunding",
  refund_failed: "Refund failed",
  refunded: "Refunded",
};
export const PURCHASE_TONE: Record<AdminPurchase["status"], "default" | "success" | "warning" | "destructive" | "info"> = {
  created: "default",
  paid: "success",
  refunding: "info",
  refund_failed: "destructive",
  refunded: "default",
};

/** A paid purchase can be refunded; one whose refund Razorpay refused can be tried again. */
export function refundable(p: Pick<AdminPurchase, "status">): boolean {
  return p.status === "paid" || p.status === "refund_failed";
}

/** What the server would refund by default: the unused share of what was paid, rounded down. */
export function proRataPaise(p: Pick<AdminPurchase, "amount_paise" | "refunded_paise" | "quantity" | "credits_remaining">): number {
  if (!p.quantity || p.credits_remaining === null || p.credits_remaining === undefined) return 0;
  const share = Math.floor((p.amount_paise * p.credits_remaining) / p.quantity);
  return Math.max(0, Math.min(share, p.amount_paise - p.refunded_paise));
}

export const REASON_MIN = 3;
export const REASON_MAX = 300;

export interface GrantForm {
  channel: CreditChannel;
  quantity: string;
  validMonths: string;
  reason: string;
}

export function grantProblems(form: GrantForm): Partial<Record<keyof GrantForm, string>> {
  const out: Partial<Record<keyof GrantForm, string>> = {};
  const q = form.quantity.trim();
  if (!/^\d+$/.test(q) || Number(q) < 1 || Number(q) > 1_000_000) out.quantity = "A whole number from 1 to 10,00,000";
  const m = form.validMonths.trim();
  if (!/^\d+$/.test(m) || Number(m) < 1 || Number(m) > 36) out.validMonths = "1 to 36 months";
  const r = form.reason.trim();
  if (r.length < REASON_MIN) out.reason = "Say why (it goes in the audit log)";
  else if (r.length > REASON_MAX) out.reason = `At most ${REASON_MAX} characters`;
  return out;
}

export function toGrantInput(form: GrantForm): GrantInput {
  return { channel: form.channel, quantity: Number(form.quantity.trim()), valid_months: Number(form.validMonths.trim()), reason: form.reason.trim() };
}

export interface RefundForm {
  reason: string;
  /** Rupees; empty is the server's default (pro-rata of the unused). */
  amount: string;
}

export function refundProblems(form: RefundForm, p: Pick<AdminPurchase, "amount_paise" | "refunded_paise">): Partial<Record<keyof RefundForm, string>> {
  const out: Partial<Record<keyof RefundForm, string>> = {};
  const r = form.reason.trim();
  if (r.length < REASON_MIN) out.reason = "Say why (it goes in the audit log)";
  else if (r.length > REASON_MAX) out.reason = `At most ${REASON_MAX} characters`;
  const a = form.amount.trim();
  if (a) {
    const left = p.amount_paise - p.refunded_paise;
    const paise = /^\d+(\.\d{1,2})?$/.test(a) ? Math.round(Number.parseFloat(a) * 100) : NaN;
    if (!Number.isFinite(paise) || paise <= 0) out.amount = "Rupees, to the paisa, or empty for the pro-rata amount";
    else if (paise > left) out.amount = `At most ${rupeesText(left)}`;
  }
  return out;
}

export function toRefundInput(form: RefundForm): { reason: string; amount_paise: number | null } {
  const a = form.amount.trim();
  return { reason: form.reason.trim(), amount_paise: a ? Math.round(Number.parseFloat(a) * 100) : null };
}

export interface PackForm {
  quantity: string;
  /** Rupees. */
  price: string;
  active: boolean;
  sortOrder: string;
}

export function toPackForm(p: Pick<AdminPack, "quantity" | "price_paise" | "active" | "sort_order">): PackForm {
  return { quantity: String(p.quantity), price: String(p.price_paise / 100), active: p.active, sortOrder: String(p.sort_order) };
}

export function packProblems(form: PackForm): Partial<Record<keyof PackForm, string>> {
  const out: Partial<Record<keyof PackForm, string>> = {};
  const q = form.quantity.trim();
  if (!/^\d+$/.test(q) || Number(q) < 1 || Number(q) > 10_000_000) out.quantity = "A whole number of messages";
  const price = form.price.trim();
  const paise = /^\d+(\.\d{1,2})?$/.test(price) ? Math.round(Number.parseFloat(price) * 100) : NaN;
  if (!Number.isFinite(paise) || paise < 100) out.price = "Rupees, ₹1 or more";
  if (!/^\d+$/.test(form.sortOrder.trim())) out.sortOrder = "A whole number";
  return out;
}

export function toPackInput(form: PackForm): Omit<PackInput, "channel"> {
  return {
    quantity: Number(form.quantity.trim()),
    price_paise: Math.round(Number.parseFloat(form.price.trim()) * 100),
    active: form.active,
    sort_order: Number(form.sortOrder.trim()),
  };
}

/** Only what changed, for PATCH. */
export function packChanges(before: AdminPack, form: PackForm): Partial<Omit<PackInput, "channel">> {
  const next = toPackInput(form);
  const out: Partial<Omit<PackInput, "channel">> = {};
  if (next.quantity !== before.quantity) out.quantity = next.quantity;
  if (next.price_paise !== before.price_paise) out.price_paise = next.price_paise;
  if (next.active !== before.active) out.active = next.active;
  if (next.sort_order !== before.sort_order) out.sort_order = next.sort_order;
  return out;
}
