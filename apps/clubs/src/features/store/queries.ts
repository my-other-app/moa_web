"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { createStoreItem, deleteStoreItem, fetchStoreItems, fetchStoreOrders, fetchStoreSummary, handOverOrder, setStoreSettings, updateStoreItem } from "./api";
import type { ItemForm } from "./schemas";

const KEY = (eventId: number) => ["store", eventId] as const;

export function useStoreItems(eventId: number) {
  return useQuery({ queryKey: [...KEY(eventId), "items"], queryFn: () => fetchStoreItems(eventId), staleTime: 10_000 });
}

export function useStoreSummary(eventId: number) {
  return useQuery({ queryKey: [...KEY(eventId), "summary"], queryFn: () => fetchStoreSummary(eventId), staleTime: 10_000, refetchInterval: 60_000 });
}

export function useStoreOrders(eventId: number, params: { q?: string; page: number; page_size: number }) {
  return useQuery({ queryKey: [...KEY(eventId), "orders", params.q ?? "", params.page, params.page_size], queryFn: () => fetchStoreOrders(eventId, params), staleTime: 10_000 });
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
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useCreateStoreItem(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: (form: ItemForm) => createStoreItem(eventId, form),
    onSuccess: (item) => {
      toast.success(`${item.name} is on the shelf`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateStoreItem(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => updateStoreItem(eventId, id, patch),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteStoreItem(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: (id: string) => deleteStoreItem(eventId, id),
    onSuccess: () => {
      toast.success("Taken off the shelf");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
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
    onError: (error: Error) => toast.error(error.message),
  });
}
