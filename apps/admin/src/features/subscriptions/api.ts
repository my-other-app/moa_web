import { api } from "@moa/app-kit";

import {
  planListSchema,
  planSchema,
  subscriptionPageSchema,
  subscriptionSchema,
  totalsSchema,
  givePlanPayload,
  type GivePlanInput,
  type Plan,
  type PlanFormInput,
  type Subscription,
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
  /** Only the plans an admin gave free (true), or only the rest (false). */
  complimentary?: boolean | undefined;
  /** One club's row. */
  clubId?: number | undefined;
  offset: number;
  limit: number;
}

export async function fetchSubscriptions(query: SubscriptionQuery) {
  const raw = await api.get<unknown>("/api/v1/admin/subscriptions", {
    query: {
      status: query.status,
      plan_id: query.planId,
      search: query.search,
      complimentary: query.complimentary,
      club_id: query.clubId,
      offset: query.offset,
      limit: query.limit,
    },
  });
  return subscriptionPageSchema.parse(raw);
}

/**
 * One club's subscription row, or null when it has none (it is on Free by
 * default). Asked by `club_id`, and by the club's name as well: a server that
 * does not filter by id still narrows by name, and the row is then picked by
 * id here, so a club with a similar name can never stand in for this one.
 */
export async function fetchClubSubscription(club: { id: number; name: string }): Promise<Subscription | null> {
  const page = await fetchSubscriptions({ clubId: club.id, search: club.name, offset: 0, limit: 50 });
  return page.items.find((row) => row.club?.id === club.id) ?? null;
}

export async function fetchTotals() {
  return totalsSchema.parse(await api.get<unknown>("/api/v1/admin/subscriptions/totals"));
}

/**
 * Give a club a plan. Grants it; never charges for it.
 *
 * Free by default (`complimentary`): ₹0, with a reason, and an end date or
 * none, and never counted as revenue. A club paying through Razorpay is
 * refused with 409 LIVE_SUBSCRIPTION until the request says to cancel that
 * subscription too (`cancelRazorpay`), so an admin cannot leave a club being
 * charged for a plan it was given.
 */
export async function assignPlan(input: { clubId: number; plan: GivePlanInput; cancelRazorpay?: boolean }) {
  return subscriptionSchema.parse(
    await api.put(`/api/v1/admin/subscriptions/club/${input.clubId}/plan`, givePlanPayload(input.plan, input.cancelRazorpay))
  );
}

/** The 409 that asks whether to cancel the club's Razorpay subscription first. */
export const LIVE_SUBSCRIPTION = "LIVE_SUBSCRIPTION";

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
