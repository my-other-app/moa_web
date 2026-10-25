import { z } from "zod";

const money = z.coerce.number().catch(0);

/** The figures every payout row and summary carries (app/api/admin_ops/payouts.py). */
export const figuresSchema = z.object({
  gross: money,
  fees: money,
  fees_estimated: z.number().catch(0),
  refunds: money,
  chargebacks: money,
  net: money,
  paid_out: money,
  outstanding: money,
  payments: z.number().catch(0),
  payouts: z.number().catch(0),
  last_payout_on: z.string().nullish(),
});
export type Figures = z.infer<typeof figuresSchema>;

export const payoutClubSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string().nullish(),
  is_deleted: z.boolean().catch(false),
});

export const overviewRowSchema = figuresSchema.extend({ club: payoutClubSchema });
export type OverviewRow = z.infer<typeof overviewRowSchema>;

export const overviewSchema = z.object({
  items: z.array(overviewRowSchema),
  total: z.number().catch(0),
  totals: figuresSchema.partial().catch({}),
  owing_clubs: z.number().catch(0),
  fee_rate_estimate: z.number().catch(0.0236),
  offset: z.number().catch(0),
  limit: z.number().catch(50),
});
export type Overview = z.infer<typeof overviewSchema>;

export const statementPaymentSchema = z.object({
  payment_log_id: z.string(),
  razorpay_payment_id: z.string().nullish(),
  status: z.string(),
  paid_at: z.string().nullish(),
  event: z.object({ id: z.number().nullish(), name: z.string().nullish() }).nullish(),
  gross: money,
  fee: money,
  fee_estimated: z.boolean().catch(false),
  refunded: money,
  chargeback: money,
  net: money,
});
export type StatementPayment = z.infer<typeof statementPaymentSchema>;

const person = z.object({ id: z.number().nullish(), name: z.string().nullish() }).nullish();

export const payoutSchema = z.object({
  id: z.number(),
  amount: money,
  paid_on: z.string(),
  reference: z.string(),
  note: z.string().nullish(),
  created_at: z.string().nullish(),
  created_by: person,
  voided: z.boolean().catch(false),
  voided_at: z.string().nullish(),
  void_reason: z.string().nullish(),
  voided_by: person,
});
export type Payout = z.infer<typeof payoutSchema>;

export const statementSchema = z.object({
  club: payoutClubSchema,
  summary: figuresSchema,
  period: z.object({ from: z.string().nullish(), to: z.string().nullish() }).catch({}),
  payments: z.array(statementPaymentSchema),
  payments_total: z.number().catch(0),
  payouts: z.array(payoutSchema),
  fee_rate_estimate: z.number().catch(0.0236),
});
export type Statement = z.infer<typeof statementSchema>;

export const feeFetchSchema = z.object({ missing: z.number().catch(0), queued: z.number().catch(0) });

export interface PayoutInput {
  amount: number;
  paid_on: string;
  reference: string;
  note?: string;
  force?: boolean;
}

/** "2.36%": the estimate used for a payment whose Razorpay fee is not read yet. */
export function feeRateLabel(rate: number): string {
  return `${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}
