"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { formatDate } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { REVENUE_KEY } from "@/features/revenue/keys";

import {
  archivePlan,
  assignPlan,
  cancelSubscription,
  createPlan,
  duplicatePlan,
  extendGrace,
  fetchClubSubscription,
  fetchPlan,
  fetchPlans,
  fetchSubscriptions,
  fetchTotals,
  retryCharge,
  syncPlan,
  updatePlan,
  type SubscriptionQuery,
} from "./api";
import type { PlanFormInput } from "./schemas";

/** Everything subscription-shaped, so one mutation can invalidate the lot. */
const KEY = ["subscriptions"] as const;

export function usePlans() {
  return useQuery({
    queryKey: [...KEY, "plans"],
    queryFn: fetchPlans,
    // Reference data an admin edits occasionally; refetching it on every
    // keystroke in the subscriber search would be pure waste.
    staleTime: 5 * 60 * 1000,
  });
}

export function usePlan(planId: number | null) {
  return useQuery({
    queryKey: [...KEY, "plans", planId],
    queryFn: () => fetchPlan(planId!),
    enabled: planId !== null && planId > 0,
  });
}

export function useSubscriptions(query: SubscriptionQuery) {
  return useQuery({
    queryKey: [...KEY, "list", query],
    queryFn: () => fetchSubscriptions(query),
    placeholderData: keepPreviousData,
  });
}

export function useSubscriptionTotals() {
  return useQuery({
    queryKey: [...KEY, "totals"],
    queryFn: fetchTotals,
    staleTime: 60 * 1000,
  });
}

/** Subscriptions, and the revenue page that counts them. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: KEY }),
      queryClient.invalidateQueries({ queryKey: REVENUE_KEY }),
    ]);
}

export function useCreatePlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (form: PlanFormInput) => createPlan(form),
    onSuccess: async (plan) => {
      toast.success(`${plan.name} created`);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not create the plan"),
  });
}

export function useUpdatePlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ planId, form }: { planId: number; form: PlanFormInput }) =>
      updatePlan(planId, form),
    onSuccess: async (plan) => {
      toast.success(`${plan.name} saved`);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the plan"),
  });
}

export function useDuplicatePlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: duplicatePlan,
    onSuccess: async (plan) => {
      toast.success(`Duplicated as “${plan.name}” — hidden until you publish it`);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not duplicate"),
  });
}

export function useArchivePlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: archivePlan,
    onSuccess: async (result) => {
      // The API's own words: it decides between archiving and deleting from
      // the live subscriber count, and it is the one that knows.
      toast.success(result.message);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not withdraw the plan"),
  });
}

export function useSyncPlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: syncPlan,
    onSuccess: async (plan) => {
      toast.success(
        plan.billable
          ? `${plan.name} is registered with Razorpay and can be charged`
          : `${plan.name} synced, but it still is not billable — check its prices`
      );
      await invalidate();
    },
    onError: (error: Error) =>
      toast.error(error.message || "Razorpay would not accept the plan"),
  });
}

/** One club's subscription row (null: none, so it is on Free), for its detail page. */
export function useClubSubscription(club: { id: number; name: string } | null) {
  return useQuery({
    queryKey: [...KEY, "club", club?.id ?? 0],
    queryFn: () => fetchClubSubscription(club!),
    enabled: Boolean(club && club.id > 0 && club.name),
  });
}

/**
 * Give a club a plan, free or not. A refusal is the dialog's to show (the
 * LIVE_SUBSCRIPTION re-ask is a question, not an error), so there is no
 * error toast here.
 */
export function useAssignPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: assignPlan,
    onSuccess: async (subscription, { plan }) => {
      const club = subscription.club?.name ?? "The club";
      const name = subscription.plan?.name ?? "the plan";
      toast.success(
        plan.complimentary
          ? `${club} is on ${name}, free${plan.endsOn ? ` until ${formatDate(`${plan.endsOn}T12:00:00+05:30`)}` : ""}`
          : `${club} moved to ${name}`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: KEY }),
        // Free plans and MRR are what the revenue page counts.
        queryClient.invalidateQueries({ queryKey: REVENUE_KEY }),
      ]);
    },
  });
}

export function useRetryCharge() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: retryCharge,
    onSuccess: async (result) => {
      // Deliberately not "charged": the outcome arrives as a webhook, and
      // claiming success here would be reporting something we have not seen.
      toast.success(result.message);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not ask for a retry"),
  });
}

export function useExtendGrace() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ subscriptionId, days }: { subscriptionId: number; days: number }) =>
      extendGrace(subscriptionId, days),
    onSuccess: async (subscription, { days }) => {
      toast.success(
        `${subscription.club?.name ?? "The club"} has ${days} more ${days === 1 ? "day" : "days"} to pay`
      );
      await invalidate();
    },
    // The dialog shows the server's refusal itself, where the admin is looking.
  });
}

export function useCancelSubscription() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ subscriptionId, atPeriodEnd }: { subscriptionId: number; atPeriodEnd: boolean; free?: boolean }) =>
      cancelSubscription(subscriptionId, atPeriodEnd),
    onSuccess: async (subscription, { atPeriodEnd, free }) => {
      const club = subscription.club?.name ?? "The club";
      toast.success(
        free
          ? `${club}'s free plan has ended; it is on Free now`
          : atPeriodEnd
            ? `${club}'s subscription ends with its period`
            : `${club}'s subscription is cancelled`
      );
      await invalidate();
    },
    // The dialog shows the server's refusal itself, where the admin is looking.
  });
}
