import { api } from "@moa/app-kit";

import {
  planListSchema,
  planSchema,
  subscriptionPageSchema,
  subscriptionSchema,
  totalsSchema,
  type Plan,
  type PlanFormInput,
  toPayload,
} from "./schemas";

export async function fetchPlans(): Promise<Plan[]> {
  const raw = await api.get<unknown>("/api/v1/admin/plans", {
    // Hidden and legacy plans are exactly what an admin needs to see: a
    // bespoke deal and a withdrawn plan are both still being billed.
    query: { include_hidden: true },
  });
  return planListSchema.parse(raw);
}

export async function fetchPlan(planId: number): Promise<Plan> {
  return planSchema.parse(await api.get<unknown>(`/api/v1/admin/plans/${planId}`));
}

export async function createPlan(form: PlanFormInput): Promise<Plan> {
  return planSchema.parse(await api.post("/api/v1/admin/plans", toPayload(form)));
}

export async function updatePlan(planId: number, form: PlanFormInput): Promise<Plan> {
  return planSchema.parse(
    await api.put(`/api/v1/admin/plans/${planId}`, toPayload(form))
  );
}

export async function duplicatePlan(planId: number): Promise<Plan> {
  return planSchema.parse(
    await api.post(`/api/v1/admin/plans/${planId}/duplicate`)
  );
}

/**
 * Withdraw a plan from sale.
 *
 * The API decides between archiving and deleting from the subscriber count --
 * the UI must not, because it would be deciding from a number it fetched
 * earlier and that may have changed.
 */
export async function archivePlan(
  planId: number
): Promise<{ outcome: "archived" | "deleted"; message: string }> {
  return api.post(`/api/v1/admin/plans/${planId}/archive`);
}

/** Register the plan with Razorpay so clubs can actually be charged for it. */
export async function syncPlan(planId: number): Promise<Plan> {
  return planSchema.parse(await api.post(`/api/v1/admin/plans/${planId}/sync`));
}

export interface SubscriptionQuery {
  status?: string | undefined;
  planId?: number | undefined;
  search?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchSubscriptions(query: SubscriptionQuery) {
  const raw = await api.get<unknown>("/api/v1/admin/subscriptions", {
    query: {
      status: query.status,
      plan_id: query.planId,
      search: query.search,
      offset: query.offset,
      limit: query.limit,
    },
  });
  return subscriptionPageSchema.parse(raw);
}

export async function fetchTotals() {
  return totalsSchema.parse(await api.get<unknown>("/api/v1/admin/subscriptions/totals"));
}

/** Move a club onto a plan. Grants it; does not charge for it. */
export async function assignPlan(input: {
  clubId: number;
  planId: number;
  cycle: "monthly" | "yearly";
}) {
  return subscriptionSchema.parse(
    await api.put(`/api/v1/admin/subscriptions/club/${input.clubId}/plan`, {
      plan_id: input.planId,
      cycle: input.cycle,
    })
  );
}

/**
 * Ask Razorpay to re-attempt a failed charge.
 *
 * The outcome arrives as a webhook, so this resolves with an
 * acknowledgement rather than a result -- the row updates when Razorpay says
 * what happened, not when we asked.
 */
export async function retryCharge(subscriptionId: number): Promise<{ message: string }> {
  return api.post(`/api/v1/admin/subscriptions/${subscriptionId}/retry`);
}

/** Give a club in grace more days to pay (1 to 30), from when its grace now ends. */
export async function extendGrace(subscriptionId: number, days: number) {
  return subscriptionSchema.parse(
    await api.post(`/api/v1/admin/subscriptions/${subscriptionId}/extend-grace`, { days })
  );
}

/**
 * Cancel at Razorpay: now, or when the paid period ends. Either way the club
 * moves to Free when what it has paid for runs out.
 */
export async function cancelSubscription(subscriptionId: number, atPeriodEnd: boolean) {
  return subscriptionSchema.parse(
    await api.post(`/api/v1/admin/subscriptions/${subscriptionId}/cancel`, { at_period_end: atPeriodEnd })
  );
}
