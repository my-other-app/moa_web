import { z } from "zod";

const money = z.coerce.number().catch(0);

export const REFUND_STATUSES = ["pending", "succeeded", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** One refund asked for on a payment: by the club, or by cancelling the event. */
export const refundItemSchema = z.object({
  id: z.string(),
  amount: money,
  reason: z.string().catch(""),
  status: z.enum(REFUND_STATUSES).catch("pending"),
  source: z.enum(["club", "cancellation"]).catch("club"),
  error: z.string().nullable().catch(null),
  created_at: z.string().nullable().catch(null),
  by: z.string().nullable().catch(null),
});
export type RefundItem = z.infer<typeof refundItemSchema>;

export const PAYMENT_STATUSES = ["captured", "partially_refunded", "refunded", "failed", "authorized", "pending", "created", "disputed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** One payment a guest made for this event, as Razorpay took it. */
export const paymentItemSchema = z.object({
  id: z.string(),
  registration_id: z.string().nullable().catch(null),
  ticket_id: z.string().nullable().catch(null),
  guest_name: z.string().nullable().catch(null),
  guest_email: z.string().nullable().catch(null),
  amount: money,
  refunded: money,
  refundable: money,
  method: z.string().nullable().catch(null),
  status: z.enum(PAYMENT_STATUSES).catch("pending"),
  paid_at: z.string().nullable().catch(null),
  gateway: z.enum(["platform", "club"]).catch("platform"),
  refunds: z.array(refundItemSchema).default([]),
});
export type PaymentItem = z.infer<typeof paymentItemSchema>;

export const eventPaymentsSchema = z.object({
  items: z.array(paymentItemSchema).default([]),
  totals: z.object({ payments: z.number().catch(0), captured: money, refunded: money }).catch({ payments: 0, captured: 0, refunded: 0 }),
});
export type EventPayments = z.infer<typeof eventPaymentsSchema>;

export const refundResultSchema = z.object({ refund: refundItemSchema, payment: paymentItemSchema });
export type RefundResult = z.infer<typeof refundResultSchema>;

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  captured: "Paid",
  partially_refunded: "Part refunded",
  refunded: "Refunded",
  failed: "Failed",
  authorized: "Authorised",
  pending: "Pending",
  created: "Started",
  disputed: "Disputed",
};

export const REASON_MIN = 3;
export const REASON_MAX = 300;
