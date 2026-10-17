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
  /* Whose Razorpay took it: the club's own account, or MyOtherApp's. Null
     from a server that does not say (every payment then was MyOtherApp's). */
  gateway: z.enum(["club", "platform"]).nullish().catch(null),
});

export const paymentPageSchema = paginatedSchema(paymentSchema);

const totalsFields = {
  captured_total: z.number().default(0),
  refunded_total: z.number().default(0),
  net_total: z.number().default(0),
  failed_count: z.number().default(0),
};

/** One account's share of the totals: MyOtherApp's own, or every club's own Razorpay together. */
export const paymentTotalsSplitSchema = z.object(totalsFields);
export type PaymentTotalsSplit = z.infer<typeof paymentTotalsSplitSchema>;

export const paymentTotalsSchema = z.object({
  ...totalsFields,
  /* The same four, split by whose Razorpay took the money. Absent (null) from a server that does not split. */
  platform: paymentTotalsSplitSchema.nullish().catch(null),
  club: paymentTotalsSplitSchema.nullish().catch(null),
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

/** Where a payment went, as the "Goes to" column and filter word it. */
export const PAYMENT_GATEWAYS = [
  { value: "club", label: "Club" },
  { value: "platform", label: "MyOtherApp" },
] as const;

export function gatewayLabel(gateway: string | null | undefined): string | null {
  return PAYMENT_GATEWAYS.find((g) => g.value === gateway)?.label ?? null;
}

export type Payment = z.infer<typeof paymentSchema>;
export type PaymentTotals = z.infer<typeof paymentTotalsSchema>;
