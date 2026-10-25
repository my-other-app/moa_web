"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nullIfRouteMissing, qk } from "@moa/api";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import { cancelEvent, fetchCancelState, retryCancelRefunds, type CancelRequest } from "./api";
import type { CancelState } from "./schemas";

export const cancelKey = (eventId: number) => ["event-cancel", eventId] as const;

/** While refunds are still on their way, the panel reads again this often. */
export const PENDING_EVERY = 5_000;

/**
 * The event's cancellation, or what cancelling would do. `null`: a backend
 * from before cancelling (a bare 404) -- nothing about cancelling is shown.
 */
export function useCancelState(eventId: number, enabled = true) {
  return useQuery({
    queryKey: cancelKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchCancelState(eventId)),
    staleTime: 10_000,
    retry: false,
    enabled,
    refetchInterval: (query) => {
      const s = query.state.data;
      return s && s.cancelled && s.refunds.pending > 0 ? PENDING_EVERY : false;
    },
  });
}

function useAfter(eventId: number) {
  const queryClient = useQueryClient();
  return (state: CancelState) => {
    queryClient.setQueryData(cancelKey(eventId), state);
    // The status shows on the event's page and summary (both under its detail key), in the list, and under Close-out (all under the events key).
    void queryClient.invalidateQueries({ queryKey: qk.events.all });
    void queryClient.invalidateQueries({ queryKey: ["event-payments", eventId] });
  };
}

export function useCancelEvent(eventId: number) {
  const after = useAfter(eventId);
  return useMutation({
    mutationFn: (body: CancelRequest) => cancelEvent(eventId, body),
    onSuccess: (state) => {
      after(state);
      toast.success(
        state.paid_online > 0
          ? "Event cancelled. Guests are being told, and their payments are on the way back."
          : "Event cancelled. Guests are being told.",
      );
    },
  });
}

export function useRetryCancelRefunds(eventId: number) {
  const after = useAfter(eventId);
  return useMutation({
    mutationFn: () => retryCancelRefunds(eventId),
    onSuccess: (state) => {
      after(state);
      if (state.refunds.failed > 0) toast.error(`${state.refunds.failed} refund${state.refunds.failed === 1 ? "" : "s"} still didn't go through.`);
      else toast.success("Every refund was asked for again.");
    },
    onError: toastError,
  });
}
