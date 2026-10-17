import { api } from "@moa/app-kit";

import {
  catalogSchema,
  entitlementsSchema,
  startSubscriptionSchema,
  subscriptionSchema,
  type CatalogPlan,
  type Cycle,
} from "./schemas";

/** The plans on sale, as the pricing page shows them. Public: sign-up reads it before there is a session. */
export async function fetchPlans() {
  return catalogSchema.parse(await api.get<unknown>("/api/v1/plans"));
}

/** The club's own subscription, or null when it never had one. */
export async function fetchSubscription() {
  const raw = await api.get<unknown>("/api/v1/clubs/subscription");
  return raw == null ? null : subscriptionSchema.parse(raw);
}

/** What the club may do, and how much of it is used. */
export async function fetchEntitlements() {
  return entitlementsSchema.parse(await api.get<unknown>("/api/v1/clubs/entitlements"));
}

/**
 * POST /clubs/subscription/start: `{plan_key, cycle}` in, a Razorpay
 * subscription out, recorded `pending`. Nothing is granted or charged here;
 * the club authorises it in Razorpay's checkout and the plan follows
 * Razorpay's webhook.
 */
export async function startSubscription(plan: Pick<CatalogPlan, "key">, cycle: Cycle) {
  return startSubscriptionSchema.parse(await api.post<unknown>("/api/v1/clubs/subscription/start", { plan_key: plan.key, cycle }));
}

/**
 * POST /clubs/subscription/cancel, no body. A paid plan ends with its period;
 * a trial, a past-due or a paused one is cancelled now and kept until
 * `current_period_end`; a pending checkout is closed and undone.
 */
export async function cancelSubscription() {
  return subscriptionSchema.parse(await api.post<unknown>("/api/v1/clubs/subscription/cancel"));
}
