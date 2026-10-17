import { z } from "zod";

/**
 * What the platform earns from club plans, from GET /admin/revenue.
 *
 * Money is paise, integers, as the database keeps it; only the formatters in
 * ./format divide. Free plans an admin gave are counted (so the owner can see
 * them) but never as money, and ticket sales are a separate box altogether:
 * that is the clubs' money, held for them, not the platform's.
 */
const count = z.number().default(0);
const paise = z.number().default(0);

const countsSchema = z.object({
  paying: count,
  trialing: count,
  complimentary: count,
  past_due: count,
  /* Also counted in past_due: never add the two. */
  in_grace: count,
  paused: count,
  pending: count,
  /* Clubs on Free: no subscription, or one that has ended. */
  free_clubs: count,
  total_clubs: count,
});

const planRowSchema = z.object({
  plan_id: z.coerce.number().nullish(),
  plan_key: z.string().nullish(),
  plan_name: z.string().nullish(),
  paying: count,
  trialing: count,
  complimentary: count,
  mrr_paise: paise,
});
export type RevenuePlanRow = z.infer<typeof planRowSchema>;

const cycleRowSchema = z.object({ paying: count, mrr_paise: paise });
const EMPTY_CYCLE = { paying: 0, mrr_paise: 0 };

export const monthPointSchema = z.object({
  /* "YYYY-MM" */
  month: z.string(),
  collected_paise: paise,
  refunded_paise: paise,
  new_paying: count,
  new_trials: count,
  cancelled: count,
  new_complimentary: count,
});
export type MonthPoint = z.infer<typeof monthPointSchema>;

export const revenueSchema = z.object({
  mrr_paise: paise,
  arr_paise: paise,
  counts: countsSchema.default({}),
  by_plan: z.array(planRowSchema).default([]),
  by_cycle: z
    .object({ monthly: cycleRowSchema.default(EMPTY_CYCLE), yearly: cycleRowSchema.default(EMPTY_CYCLE) })
    .default({ monthly: EMPTY_CYCLE, yearly: EMPTY_CYCLE }),
  collected: z
    .object({
      this_month_paise: paise,
      last_month_paise: paise,
      year_to_date_paise: paise,
      all_time_paise: paise,
      refunded_paise: paise,
    })
    .default({}),
  /* Oldest first, one entry per month. */
  series: z.array(monthPointSchema).default([]),
  upcoming_renewals: z.object({ next_30_days_paise: paise, count }).default({}),
  /* The clubs' money taken through MyOtherApp's Razorpay account: held for them, not revenue. */
  ticket_sales: z
    .object({ this_month_paise: paise, all_time_paise: paise, note: z.string().nullish() })
    .nullish()
    .catch(null),
});
export type Revenue = z.infer<typeof revenueSchema>;

/** One plan charge Razorpay took, from GET /admin/revenue/charges. */
export const chargeSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  club: z.object({ id: z.coerce.number(), name: z.string(), slug: z.string().nullish() }).nullish(),
  plan_name: z.string().nullish(),
  cycle: z.string().nullish(),
  amount_paise: paise,
  refunded_paise: paise,
  /* Kept as the server says it. */
  status: z.string().default("captured"),
  razorpay_payment_id: z.string().nullish(),
  charged_at: z.string().nullish(),
});
export type Charge = z.infer<typeof chargeSchema>;

export const chargePageSchema = z.object({
  items: z.array(chargeSchema),
  total: count,
  /* The sum of every charge the filters match, not only this page's. */
  sum_paise: paise,
});
export type ChargePage = z.infer<typeof chargePageSchema>;

/** POST /admin/revenue/backfill: how many subscriptions were read at Razorpay, the payments that were new or changed, and the subscriptions Razorpay would not answer for. */
export const backfillSchema = z.object({ scanned: count, inserted: count, updated: count.default(0), failed: count.default(0) });
export type BackfillResult = z.infer<typeof backfillSchema>;
