import { z } from "zod";
import { api } from "@moa/app-kit";

/**
 * Prepaid message credits: what a club has to send with, and buying more.
 *
 * Each month the plan's own allowance is used first ("plan credits", reset
 * monthly). Past it, sends draw on bought credits -- packs paid for once,
 * each lasting 12 months -- earliest expiry first. With nothing left,
 * announcements, campaigns and reminders are held back; tickets,
 * certificates and payment messages always go and are never charged.
 *
 * Money is paise on the wire. Pack prices include GST, as plan prices do.
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

export const packSchema = z.object({
  id: z.coerce.number(),
  channel: z.enum(CREDIT_CHANNELS),
  quantity: z.number().int().positive(),
  price_paise: z.number().int().nonnegative(),
  sort_order: z.number().catch(0),
});
export type CreditPack = z.infer<typeof packSchema>;

export const lotSchema = z.object({
  id: z.coerce.number(),
  /** purchase: bought by the club. grant: free credits from MyOtherApp. */
  source: z.enum(["purchase", "grant"]).catch("purchase"),
  quantity: count,
  remaining: count,
  bought_at: when,
  expires_at: when,
  purchase_id: z.coerce.number().nullish().catch(null),
  reason: z.string().nullish().catch(null),
});
export type CreditLot = z.infer<typeof lotSchema>;

export const PURCHASE_STATUSES = ["created", "paid", "refunding", "refund_failed", "refunded"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const purchaseSchema = z.object({
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
});
export type CreditPurchase = z.infer<typeof purchaseSchema>;

const channelCreditsSchema = z.object({
  /** This month's plan allowance; limit and remaining are null when unlimited. */
  plan: z
    .object({ limit: z.number().nullable().catch(null), used: count, remaining: z.number().nullable().catch(null) })
    .catch({ limit: null, used: 0, remaining: null }),
  bought: z
    .object({ remaining: count, next_expiry: when, low: z.boolean().catch(false) })
    .catch({ remaining: 0, next_expiry: null, low: false }),
  /** Plan left plus bought left; null when the plan is unlimited. */
  total_remaining: z.number().nullable().catch(null),
  /** Lots with credits left, earliest expiry first. */
  lots: listOf(lotSchema),
});
export type ChannelCredits = z.infer<typeof channelCreditsSchema>;

export const creditsSchema = z.object({
  period: z.string().catch(""),
  period_label: z.string().catch(""),
  prices_include_gst: z.boolean().catch(true),
  validity_months: z.number().int().positive().catch(12),
  /** False when payments can't be taken right now: no buy buttons. */
  can_buy: z.boolean().catch(false),
  channels: z.object({ email: channelCreditsSchema, whatsapp: channelCreditsSchema }),
  packs: listOf(packSchema),
  purchases: listOf(purchaseSchema),
});
export type Credits = z.infer<typeof creditsSchema>;

export const creditOrderSchema = z.object({
  purchase_id: z.coerce.number(),
  razorpay_order_id: z.string(),
  amount_paise: z.number(),
  currency: z.string().catch("INR"),
  key_id: z.string().nullish().catch(null),
  name: z.string().catch("MyOtherApp"),
  description: z.string().catch(""),
  receipt_number: z.string().catch(""),
  prefill: z
    .object({ email: z.string().nullish(), contact: z.string().nullish(), name: z.string().nullish() })
    .nullish()
    .catch(null),
});
export type CreditOrder = z.infer<typeof creditOrderSchema>;

export const receiptSchema = z.object({
  receipt_number: z.string().catch(""),
  issued_at: when,
  status: z.enum(PURCHASE_STATUSES).catch("paid"),
  seller: z
    .object({ name: z.string().catch("MyOtherApp"), website: z.string().nullish(), email: z.string().nullish() })
    .catch({ name: "MyOtherApp", website: null, email: null }),
  club: z
    .object({ id: z.coerce.number().nullish(), name: z.string().catch(""), email: z.string().nullish() })
    .catch({ id: null, name: "", email: null }),
  item: z.string().catch(""),
  channel: z.enum(CREDIT_CHANNELS).catch("email"),
  quantity: count,
  amount_paise: count,
  currency: z.string().catch("INR"),
  prices_include_gst: z.boolean().catch(true),
  razorpay_payment_id: z.string().nullish().catch(null),
  payment_method: z.string().nullish().catch(null),
  refunded_paise: count,
  refunded_at: when,
  expires_at: when,
});
export type CreditReceipt = z.infer<typeof receiptSchema>;

// ─── Calls ───────────────────────────────────────────────────────────────

/** GET /clubs/messages/credits: balances, lots, packs on sale and purchases. */
export async function fetchCredits() {
  return creditsSchema.parse(await api.get<unknown>("/api/v1/clubs/messages/credits"));
}

/** POST /clubs/messages/credits/orders: a Razorpay order for one pack (the owner only). */
export async function createCreditOrder(packId: number) {
  return creditOrderSchema.parse(await api.post<unknown>("/api/v1/clubs/messages/credits/orders", { pack_id: packId }));
}

/** POST /clubs/messages/credits/verify: what checkout's handler got back; the purchase as it stands. */
export async function verifyCreditPayment(input: { orderId: string; paymentId: string; signature: string }) {
  return purchaseSchema.parse(
    await api.post<unknown>("/api/v1/clubs/messages/credits/verify", {
      razorpay_order_id: input.orderId,
      razorpay_payment_id: input.paymentId,
      razorpay_signature: input.signature,
    }),
  );
}

/** GET /clubs/messages/credits/purchases/{id}/receipt. */
export async function fetchCreditReceipt(purchaseId: number) {
  return receiptSchema.parse(await api.get<unknown>(`/api/v1/clubs/messages/credits/purchases/${purchaseId}/receipt`));
}

// ─── Words ───────────────────────────────────────────────────────────────

const WHOLE = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const EXACT = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹99, ₹1,599, ₹1.50. */
export function rupeesText(paise: number): string {
  return paise % 100 === 0 ? WHOLE.format(paise / 100) : EXACT.format(paise / 100);
}

export const CREDIT_TITLE: Record<CreditChannel, string> = { email: "Email", whatsapp: "WhatsApp" };

/** "1,000 emails", "1 WhatsApp message". */
export function messagesText(channel: CreditChannel, n: number): string {
  const many = channel === "email" ? (n === 1 ? "email" : "emails") : n === 1 ? "WhatsApp message" : "WhatsApp messages";
  return `${n.toLocaleString("en-IN")} ${many}`;
}

/** What one message comes to in a pack, to the paisa: "₹0.10 each", "≈ ₹0.09 each". */
export function perMessageText(pack: Pick<CreditPack, "quantity" | "price_paise">): string {
  if (pack.quantity <= 0) return "";
  const exact = pack.price_paise / pack.quantity;
  const paise = Math.round(exact);
  return `${Number.isInteger(exact) ? "" : "≈ "}${EXACT.format(paise / 100)} each`;
}

/** The packs of one channel, cheapest first as the server orders them. */
export function packsFor(credits: Pick<Credits, "packs">, channel: CreditChannel): CreditPack[] {
  return credits.packs.filter((p) => p.channel === channel);
}

/** "Paid", "Refunded", "Partly refunded (₹40)", "Refund in progress". */
export function purchaseStatusText(p: Pick<CreditPurchase, "status" | "refunded_paise" | "amount_paise">): string {
  switch (p.status) {
    case "paid":
      return "Paid";
    case "refunding":
    case "refund_failed":
      return "Refund in progress";
    case "refunded":
      return p.refunded_paise > 0 && p.refunded_paise < p.amount_paise ? `Partly refunded (${rupeesText(p.refunded_paise)})` : "Refunded";
    default:
      return "Awaiting payment";
  }
}

/** Why an order or a verify was refused, in words for the club. */
export function creditErrorText(error: unknown): string {
  const e = error as { errorCode?: string | null; status?: number; message?: string } | null;
  switch (e?.errorCode) {
    case "PACK_NOT_FOUND":
      return "That pack isn't on sale any more. Pick another one.";
    case "CHECKOUT_UNAVAILABLE":
      return "Buying credits isn't available right now. Try again later.";
    case "RAZORPAY_ERROR":
      return "Razorpay couldn't start the payment. Try again in a minute.";
    case "PURCHASE_NOT_FOUND":
      return "We couldn't find that purchase.";
    case "PAYMENT_ORDER_MISMATCH":
    case "BAD_SIGNATURE":
      return "Razorpay's confirmation didn't match this purchase. If you were charged, your credits appear once Razorpay confirms the payment.";
  }
  if (e?.status === 403) return "Only the club's own account can buy credits.";
  if (e?.status !== undefined && e.status >= 500) return "That didn't go through. Try again in a minute.";
  return e?.message || "That didn't go through. Try again.";
}
