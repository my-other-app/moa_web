import { api } from "@moa/app-kit";

import { backfillSchema, chargePageSchema, revenueSchema } from "./schemas";

/** Subscriptions, MRR, money collected per month and the rest, for the last `months` months. */
export async function fetchRevenue(months: number) {
  return revenueSchema.parse(await api.get<unknown>("/api/v1/admin/revenue", { query: { months } }));
}

export interface ChargeQuery {
  offset: number;
  limit: number;
  clubId?: number | undefined;
  /** "YYYY-MM" */
  month?: string | undefined;
}

/** Plan charges Razorpay took, newest first, with the sum of every one the filters match. */
export async function fetchCharges(query: ChargeQuery) {
  const raw = await api.get<unknown>("/api/v1/admin/revenue/charges", {
    query: { offset: query.offset, limit: query.limit, club_id: query.clubId, month: query.month },
  });
  return chargePageSchema.parse(raw);
}

/**
 * Read Razorpay's record of plan payments and add any this side never heard
 * of (a webhook that did not arrive). Money permission; safe to repeat.
 */
export async function backfillRevenue() {
  return backfillSchema.parse(await api.post<unknown>("/api/v1/admin/revenue/backfill"));
}
