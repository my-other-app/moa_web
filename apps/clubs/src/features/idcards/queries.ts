"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { fetchCardSummary, fetchPrintJobs, updateCardSettings } from "./api";
import type { CardSettings } from "./schemas";

const root = (eventId: number) => [...qk.events.detail(eventId), "idcards"] as const;

export function useCardSummary(eventId: number) {
  return useQuery({ queryKey: [...root(eventId), "summary"], queryFn: () => fetchCardSummary(eventId), staleTime: 5_000, refetchOnWindowFocus: true });
}

export function usePrintJobs(eventId: number) {
  return useQuery({ queryKey: [...root(eventId), "jobs"], queryFn: () => fetchPrintJobs(eventId), staleTime: 5_000, refetchOnWindowFocus: true });
}

export function useRefreshCards(eventId: number) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: root(eventId) });
}

export function useUpdateCardSettings(eventId: number) {
  const refresh = useRefreshCards(eventId);
  return useMutation({
    mutationFn: (body: Partial<CardSettings>) => updateCardSettings(eventId, body),
    onSuccess: () => {
      toast.success("Card settings saved");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
