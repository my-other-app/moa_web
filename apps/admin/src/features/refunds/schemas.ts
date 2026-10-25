import { z } from "zod";

const money = z.coerce.number().catch(0);

export const refundDetailSchema = z.object({
  payment: z.object({
    id: z.string(),
    razorpay_payment_id: z.string().nullish(),
    status: z.string(),
    amount: money,
    refunded: money,
    refundable: money,
    gateway: z.string().catch("platform"),
  }),
  ticket: z
    .object({
      registration_id: z.string(),
      name: z.string().nullish(),
      paid_amount: money,
      price: money,
      is_paid: z.boolean().catch(false),
    })
    .nullish(),
  store_orders: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        total: money,
        summary: z.string().catch(""),
        handed_over: z.boolean().catch(false),
        refundable: z.boolean().catch(false),
      })
    )
    .catch([]),
  refunds: z
    .array(
      z.object({
        id: z.number(),
        kind: z.string(),
        amount: money,
        reason: z.string().catch(""),
        razorpay_refund_id: z.string().nullish(),
        created_at: z.string().nullish(),
        by: z.string().nullish(),
      })
    )
    .catch([]),
});
export type RefundDetail = z.infer<typeof refundDetailSchema>;

export type RefundKind = "ticket" | "store_order" | "rest";

export interface PaymentRefundInput {
  kind: RefundKind;
  amount?: number;
  store_order_id?: string;
  reason: string;
}

export const chargeRefundResultSchema = z.object({
  id: z.number(),
  amount_paise: z.number(),
  refunded_paise: z.number(),
  status: z.string(),
  razorpay_payment_id: z.string().nullish(),
  refund_id: z.string().nullish(),
});

export const REFUND_KIND_WORDS: Record<string, string> = {
  ticket: "Part of the ticket",
  store_order: "A store order",
  rest: "The rest of the payment",
};
