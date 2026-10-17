"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { staleTimes } from "@moa/app-kit";

import { fetchEntitlements, fetchPlans, fetchSubscription, startSubscription } from "./api";
import { SALES_EMAIL, type CatalogPlan, type Cycle } from "./schemas";

export const BILLING_KEY = ["billing"] as const;

export function usePlans() {
  return useQuery({ queryKey: [...BILLING_KEY, "plans"], queryFn: fetchPlans, staleTime: staleTimes.reference, retry: false });
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
  return useQuery({ queryKey: [...BILLING_KEY, "entitlements"], queryFn: fetchEntitlements, refetchInterval: watch ? 5_000 : false });
}

export function useRefreshBilling() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: BILLING_KEY });
}

/** The sentence a plan that cannot be bought online yet gets. */
export const NOT_FOR_SALE = `This plan can't be bought online yet. Write to ${SALES_EMAIL} and we'll set it up for you.`;

/**
 * Why a start was refused, in words for the club.
 *
 * A paid plan with no Razorpay plan behind it fails inside Razorpay, which
 * the server reports as a bare 500; a catalogue entry with no id is refused
 * for the missing `plan_id`; a plan that has since gone is a 404. All three
 * mean the same thing to the club, so they read the same.
 */
export function startErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isServer || error.isNotFound) return NOT_FOR_SALE;
    if (error.status === 422 && error.fieldErrors && "plan_id" in error.fieldErrors) return NOT_FOR_SALE;
    return error.message;
  }
  return error instanceof Error && error.message ? error.message : "Could not start the subscription. Try again.";
}

export function useStartSubscription() {
  return useMutation({
    mutationFn: ({ plan, cycle }: { plan: CatalogPlan; cycle: Cycle }) => startSubscription(plan, cycle),
  });
}
