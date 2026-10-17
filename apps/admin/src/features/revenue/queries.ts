"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatNumber, staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { backfillRevenue, fetchCharges, fetchRevenue, type ChargeQuery } from "./api";
import { REVENUE_KEY } from "./keys";

export function useRevenue(months: number) {
  return useQuery({
    queryKey: [...REVENUE_KEY, "summary", months],
    queryFn: () => fetchRevenue(months),
    staleTime: staleTimes.analytics,
    placeholderData: keepPreviousData,
  });
}

export function useCharges(query: ChargeQuery) {
  return useQuery({
    queryKey: [...REVENUE_KEY, "charges", query],
    queryFn: () => fetchCharges(query),
    placeholderData: keepPreviousData,
  });
}

/** "Sync from Razorpay": reads Razorpay's payments and adds the missing ones. */
export function useBackfill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: backfillRevenue,
    onSuccess: async ({ scanned, inserted }) => {
      toast.success(
        inserted > 0
          ? `Synced from Razorpay: ${formatNumber(scanned)} payments checked, ${formatNumber(inserted)} added`
          : `Synced from Razorpay: ${formatNumber(scanned)} payments checked, nothing was missing`
      );
      await queryClient.invalidateQueries({ queryKey: REVENUE_KEY });
    },
    onError: (error: Error) => toast.error(error.message || "Could not sync from Razorpay"),
  });
}
