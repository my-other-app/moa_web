"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import {
  fetchPaymentTotals,
  fetchPayments,
  refundPayment,
  type PaymentQuery,
} from "./api";

export function usePayments(query: PaymentQuery) {
  return useQuery({
    queryKey: ["payments", query],
    queryFn: () => fetchPayments(query),
    placeholderData: keepPreviousData,
  });
}

export function usePaymentTotals() {
  return useQuery({
    queryKey: ["payments", "totals"],
    queryFn: fetchPaymentTotals,
    staleTime: staleTimes.analytics,
  });
}

export function useRefundPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: refundPayment,
    onSuccess: async () => {
      toast.success("Refund issued");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        // The refund is written to the audit log, and revenue figures move.
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
