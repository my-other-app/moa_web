"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { toastError } from "@/features/plan/errors";

import { cancelPrintRequest, fetchPrinters, fetchPrintRequests, retryPrintRequest, type QueueFilter } from "./api";

const root = (eventId: number) => [...qk.events.detail(eventId), "idcards", "print-stations"] as const;

/** The event's print stations. Slow to poll: it only decides whether "Send to the print station" is offered. */
export function usePrinters(eventId: number) {
  return useQuery({ queryKey: [...root(eventId), "printers"], queryFn: () => fetchPrinters(eventId), staleTime: 10_000, refetchInterval: 15_000, retry: false });
}
/** How many stations are online right now (0 while it loads or when the server has no print stations). */
export const onlineCount = (printers: ReadonlyArray<{ online: boolean }> | undefined) => printers?.filter((p) => p.online).length ?? 0;

/** The queue, re-read every 3 seconds while the page is visible (the poll pauses in a background tab). */
export function usePrintQueue(eventId: number, filter: QueueFilter = "all") {
  return useQuery({ queryKey: [...root(eventId), "queue", filter], queryFn: () => fetchPrintRequests(eventId, filter), refetchInterval: 3_000, refetchIntervalInBackground: false, retry: false });
}

function useRefreshQueue(eventId: number) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: root(eventId) });
}
export function useRetryPrintRequest(eventId: number) {
  const refresh = useRefreshQueue(eventId);
  return useMutation({ mutationFn: (id: string) => retryPrintRequest(eventId, id), onSuccess: refresh, onError: toastError });
}
export function useCancelPrintRequest(eventId: number) {
  const refresh = useRefreshQueue(eventId);
  return useMutation({ mutationFn: (id: string) => cancelPrintRequest(eventId, id), onSuccess: refresh, onError: toastError });
}
