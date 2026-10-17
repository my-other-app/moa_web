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

/** What the club may do: its plan's limits and features. */
export async function fetchEntitlements() {
  return entitlementsSchema.parse(await api.get<unknown>("/api/v1/clubs/entitlements"));
}

/**
 * POST /clubs/subscription/start: `{plan_id, cycle}` in, a Razorpay
 * subscription out. Nothing is charged here; the club authorises it in
 * Razorpay's checkout and the plan follows Razorpay's webhook.
 *
 * `plan_key` rides along for a server that takes keys; today's ignores it.
 */
export async function startSubscription(plan: Pick<CatalogPlan, "id" | "key">, cycle: Cycle) {
  const body: Record<string, unknown> = { plan_key: plan.key, cycle };
  if (plan.id != null) body.plan_id = plan.id;
  return startSubscriptionSchema.parse(await api.post<unknown>("/api/v1/clubs/subscription/start", body));
}
