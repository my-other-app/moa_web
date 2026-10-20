"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { CATALOGUE_KEY } from "@/features/catalogue";
import { toastError } from "@/features/plan/errors";

import { fetchStoreItems, fetchStoreOrders, fetchStoreSummary, fulfilOrder, handOverOrder, removeFromEvent, setStoreSettings } from "./api";
import type { OrderFilter } from "./schemas";

const KEY = (eventId: number) => ["store", eventId] as const;

export function useStoreItems(eventId: number) {
  return useQuery({ queryKey: [...KEY(eventId), "items"], queryFn: () => fetchStoreItems(eventId), staleTime: 10_000 });
}

export function useStoreSummary(eventId: number) {
  return useQuery({ queryKey: [...KEY(eventId), "summary"], queryFn: () => fetchStoreSummary(eventId), staleTime: 10_000, refetchInterval: 60_000 });
}

export function useStoreOrders(eventId: number, params: { q?: string; status?: OrderFilter; page: number; page_size: number }) {
  return useQuery({ queryKey: [...KEY(eventId), "orders", params.q ?? "", params.status ?? "", params.page, params.page_size], queryFn: () => fetchStoreOrders(eventId, params), staleTime: 10_000 });
}

function useRefresh(eventId: number) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: KEY(eventId) });
    void queryClient.invalidateQueries({ queryKey: qk.events.detail(eventId) });
  };
}

export function useStoreSettings(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: (patch: { merch_enabled?: boolean; swag_enabled?: boolean }) => setStoreSettings(eventId, patch),
    onSuccess: (r, patch) => {
      if (patch.merch_enabled !== undefined) toast.success(r.merch_enabled ? "Merchandise is offered at registration" : "Merchandise is off for this event");
      if (patch.swag_enabled !== undefined) toast.success(r.swag_enabled ? "Swag is on for this event" : "Swag is off for this event");
      refresh();
    },
    onError: toastError,
  });
}

export function useRemoveFromEvent(eventId: number) {
  const refresh = useRefresh(eventId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => removeFromEvent(eventId, id),
    onSuccess: (_r, { name }) => {
      toast.success(`${name} is no longer offered on this event`, { description: "It stays in your merchandise." });
      refresh();
      // The catalogue says which events offer each item.
      void queryClient.invalidateQueries({ queryKey: CATALOGUE_KEY });
    },
    onError: toastError,
  });
}

export function useHandOver(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: ({ orderId, undo }: { orderId: string; undo?: boolean }) => handOverOrder(eventId, orderId, undo),
    onSuccess: (o) => {
      toast.success(o.handed_over_at ? `Handed over to ${o.guest}` : "Handover taken back");
      refresh();
    },
    onError: toastError,
  });
}

/** Settles an oversold order (the server refuses while the pieces are still not there), then reads the orders again. */
export function useFulfil(eventId: number) {
  const refresh = useRefresh(eventId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => fulfilOrder(eventId, orderId),
    onSuccess: (o) => {
      toast.success(`${o.guest}'s order is settled`, { description: "It is paid and ready to hand over." });
      refresh();
      void queryClient.invalidateQueries({ queryKey: CATALOGUE_KEY });
    },
    onError: toastError,
  });
}
