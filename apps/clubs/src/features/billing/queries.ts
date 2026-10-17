"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { staleTimes } from "@moa/app-kit";

import { cancelSubscription, fetchEntitlements, fetchPlans, fetchSubscription, startSubscription } from "./api";
import { SALES_EMAIL, type CatalogPlan, type Cycle } from "./schemas";

export const BILLING_KEY = ["billing"] as const;

/** The entitlements' cache key: Plan & billing and every lock in the dashboard read the same entry. */
export const ENTITLEMENTS_KEY = [...BILLING_KEY, "entitlements"] as const;

export function usePlans(enabled = true) {
  return useQuery({ queryKey: [...BILLING_KEY, "plans"], queryFn: fetchPlans, staleTime: staleTimes.reference, retry: false, enabled });
}

/**
 * The subscription and the entitlements change only when Razorpay's webhook
 * lands, a few seconds to a minute after checkout. `watch` polls while the
 * page is waiting for that.
 */
export function useSubscription(watch = false) {
  return useQuery({ queryKey: [...BILLING_KEY, "subscription"], queryFn: fetchSubscription, refetchInterval: watch ? 5_000 : false });
}

export function useEntitlements(watch = false) {
  return useQuery({ queryKey: ENTITLEMENTS_KEY, queryFn: fetchEntitlements, refetchInterval: watch ? 5_000 : false });
}

export function useRefreshBilling() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: BILLING_KEY });
}

/** The sentence a plan that cannot be bought online gets. */
export const NOT_FOR_SALE = `This plan can't be bought online right now. Write to ${SALES_EMAIL} and we'll set it up for you.`;

/** The refusals of /clubs/subscription/start and /cancel, by `error_code`, in words for the club. */
const BY_CODE: Record<string, string> = {
  PLAN_NOT_AVAILABLE: NOT_FOR_SALE,
  CONTACT_SALES: `This plan is arranged with our team. Write to ${SALES_EMAIL} and we'll set it up.`,
  FREE_PLAN: "Free needs no subscription: it is what the club has without one.",
  SUBSCRIPTION_EXISTS: "You already have a subscription; cancel it first or talk to us to switch.",
  CHECKOUT_NOT_CLOSED: "Razorpay hasn't confirmed your earlier checkout is closed yet. Try again in a minute.",
  NO_SUBSCRIPTION: "There is no paid subscription to cancel.",
};

/**
 * Why a start or a cancel was refused, in words for the club. A bare 5xx
 * with no code is Razorpay failing underneath (a plan it cannot create, an
 * outage): to the club that is a plan it cannot buy right now.
 */
export function billingErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errorCode && BY_CODE[error.errorCode]) return BY_CODE[error.errorCode]!;
    if (error.isServer) return NOT_FOR_SALE;
    return error.message;
  }
  return error instanceof Error && error.message ? error.message : "That did not go through. Try again.";
}

export function useStartSubscription() {
  return useMutation({
    mutationFn: ({ plan, cycle }: { plan: CatalogPlan; cycle: Cycle }) => startSubscription(plan, cycle),
  });
}

export function useCancelSubscription() {
  return useMutation({ mutationFn: cancelSubscription });
}
