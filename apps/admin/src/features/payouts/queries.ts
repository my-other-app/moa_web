"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { fetchFees, fetchPayoutOverview, fetchStatement, recordPayout, voidPayout, type OverviewQuery, type StatementQuery } from "./api";
import type { PayoutInput } from "./schemas";

const KEY = ["admin", "payouts"] as const;

export function usePayoutOverview(query: OverviewQuery) {
  return useQuery({
    queryKey: [...KEY, "overview", query],
    queryFn: () => fetchPayoutOverview(query),
    placeholderData: keepPreviousData,
    staleTime: staleTimes.volatile,
  });
}

export function useStatement(clubId: number, query: StatementQuery) {
  return useQuery({
    queryKey: [...KEY, "statement", clubId, query],
    queryFn: () => fetchStatement(clubId, query),
    placeholderData: keepPreviousData,
  });
}

export function useRecordPayout(clubId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PayoutInput) => recordPayout(clubId, input),
    onSuccess: async () => {
      toast.success("Payout recorded");
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useVoidPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => voidPayout(id, reason),
    onSuccess: async () => {
      toast.success("Payout voided");
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error: Error) => toast.error(error.message || "Could not void the payout"),
  });
}

export function useFetchFees() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fetchFees,
    onSuccess: async (result) => {
      toast.success(
        result.missing === 0
          ? "Every payment already has its Razorpay fee"
          : `Asking Razorpay for the fees on ${result.queued} payment${result.queued === 1 ? "" : "s"}. Refresh in a minute.`
      );
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error: Error) => toast.error(error.message || "Could not ask Razorpay"),
  });
}
