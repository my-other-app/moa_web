import { paginatedSchema } from "@moa/api";
import { z } from "zod";

/** GET /payments/admin/list. */
export const paymentSchema = z.object({
  id: z.string(),
  razorpay_payment_id: z.string().nullish(),
  status: z.string(),
  amount: z.number().default(0),
  payment_method: z.string().nullish(),
  created_at: z.string(),
  order_id: z.string().nullish(),
  razorpay_order_id: z.string().nullish(),
  receipt: z.string().nullish(),
  order_status: z.string().nullish(),
  user: z
    .object({
      id: z.coerce.number().nullish(),
      full_name: z.string().nullish(),
      email: z.string().nullish(),
    })
    .nullish(),
  /* Computed server-side: only a captured payment can be refunded, and the
     UI should not re-derive a rule the service owns. */
  is_refundable: z.boolean().default(false),
});

export const paymentPageSchema = paginatedSchema(paymentSchema);

export const paymentTotalsSchema = z.object({
  captured_total: z.number().default(0),
  refunded_total: z.number().default(0),
  net_total: z.number().default(0),
  failed_count: z.number().default(0),
});

/** The statuses the backend enum actually has. */
export const PAYMENT_STATUSES = [
  "captured",
  "authorized",
  "refunded",
  "failed",
  "pending",
  "created",
  "disputed",
] as const;

export type Payment = z.infer<typeof paymentSchema>;
export type PaymentTotals = z.infer<typeof paymentTotalsSchema>;
