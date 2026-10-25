"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nullIfRouteMissing, qk } from "@moa/api";
import { formatCurrency } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import { fetchEventPayments, refundPayment, retryRefund, type RefundRequest } from "./api";
import type { RefundResult } from "./schemas";

export const paymentsKey = (eventId: number) => ["event-payments", eventId] as const;

/**
 * The event's payments. `null`: a backend from before club refunds (a bare
 * 404) -- the Payments tab stays hidden until the backend has the route.
 */
export function useEventPayments(eventId: number, enabled = true) {
  return useQuery({
    queryKey: paymentsKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchEventPayments(eventId)),
    staleTime: 15_000,
    retry: false,
    enabled,
  });
}

/** What the refund came to, said once it is back. */
export function announce(r: RefundResult) {
  const who = r.payment.guest_name || r.payment.guest_email || "the guest";
  const amount = formatCurrency(r.refund.amount);
  if (r.refund.status === "succeeded") toast.success(`Refunded ${amount} to ${who}. They've been told.`);
  else if (r.refund.status === "pending") toast.success(`Refund of ${amount} to ${who} asked for. It shows here once Razorpay confirms it.`);
  else toast.error(`Razorpay didn't take the refund of ${amount}${r.refund.error ? `: ${r.refund.error}` : ""}. It's listed under the payment to try again.`);
}

function useRefresh(eventId: number) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: paymentsKey(eventId) });
    // Paid states on the guest list, the cancellation's progress, and the money pages follow a refund.
    void queryClient.invalidateQueries({ queryKey: qk.events.registrations(eventId) });
    void queryClient.invalidateQueries({ queryKey: ["event-cancel", eventId] });
    void queryClient.invalidateQueries({ queryKey: ["finance"] });
  };
}

export function useRefundPayment(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: ({ paymentId, body }: { paymentId: string; body: RefundRequest }) => refundPayment(eventId, paymentId, body),
    onSuccess: (r) => {
      announce(r);
      refresh();
    },
  });
}

export function useRetryRefund(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: (refundId: string) => retryRefund(eventId, refundId),
    onSuccess: (r) => {
      announce(r);
      refresh();
    },
    onError: toastError,
  });
}
