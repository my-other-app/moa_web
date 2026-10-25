"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { REVENUE_KEY } from "@/features/revenue/keys";

import { fetchRefundDetail, refundCharge, refundPaymentPart } from "./api";
import type { PaymentRefundInput } from "./schemas";

export function useRefundDetail(paymentId: string | null) {
  return useQuery({
    queryKey: ["admin", "refunds", paymentId],
    queryFn: () => fetchRefundDetail(paymentId!),
    enabled: Boolean(paymentId),
    staleTime: 0,
  });
}

export function useRefundPaymentPart(paymentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PaymentRefundInput) => refundPaymentPart(paymentId, input),
    onSuccess: async () => {
      toast.success("Refund issued");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "refunds", paymentId] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "payouts"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Razorpay did not take the refund"),
  });
}

export function useRefundCharge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chargeId, amount, reason }: { chargeId: number | string; amount?: number | undefined; reason: string }) => refundCharge(chargeId, { amount, reason }),
    onSuccess: async () => {
      toast.success("Refund issued");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: REVENUE_KEY }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Razorpay did not take the refund"),
  });
}
