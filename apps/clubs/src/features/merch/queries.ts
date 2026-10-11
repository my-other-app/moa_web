"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { addMerchVariant, collectMerch, createMerchItem, deleteMerchItem, deleteMerchVariant, fetchAttendeeMerch, fetchMerchAnalytics, fetchMerchFields, fetchMerchItems, fetchMerchLog, updateMerchItem, updateMerchVariant, type MerchLogQuery } from "./api";
import type { MerchItemInput } from "./schemas";

const key = (eventId: number) => [...qk.events.detail(eventId), "merch"] as const;

export function useMerchItems(eventId: number) {
  return useQuery({ queryKey: [...key(eventId), "items"], queryFn: () => fetchMerchItems(eventId), staleTime: 10_000 });
}
export function useMerchFields(eventId: number) {
  return useQuery({ queryKey: [...key(eventId), "fields"], queryFn: () => fetchMerchFields(eventId), staleTime: 60_000 });
}
export function useMerchLog(q: MerchLogQuery) {
  return useQuery({ queryKey: [...key(q.eventId), "log", q], queryFn: () => fetchMerchLog(q), placeholderData: keepPreviousData, staleTime: 10_000 });
}
export function useMerchAnalytics(eventId: number) {
  return useQuery({ queryKey: [...key(eventId), "analytics"], queryFn: () => fetchMerchAnalytics(eventId), staleTime: 10_000 });
}
function useRefresh(eventId: number) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: key(eventId) });
}
const fail = (e: Error) => toast.error(e.message);

export function useCreateMerchItem(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (body: MerchItemInput) => createMerchItem(eventId, body), onSuccess: refresh, onError: fail });
}
export function useUpdateMerchItem(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<MerchItemInput> }) => updateMerchItem(eventId, id, body), onSuccess: refresh, onError: fail });
}
export function useDeleteMerchItem(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: ({ id, withCollections }: { id: string; withCollections?: boolean }) => deleteMerchItem(eventId, id, withCollections), onSuccess: () => (toast.success("Item removed"), refresh()), onError: fail });
}
export function useAddMerchVariant(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: { label: string; stock: number } }) => addMerchVariant(eventId, id, body), onSuccess: refresh, onError: fail });
}
export function useUpdateMerchVariant(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: ({ id, variantId, body }: { id: string; variantId: string; body: { label?: string; stock?: number } }) => updateMerchVariant(eventId, id, variantId, body), onSuccess: refresh, onError: fail });
}
export function useDeleteMerchVariant(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: ({ id, variantId }: { id: string; variantId: string }) => deleteMerchVariant(eventId, id, variantId), onSuccess: refresh, onError: fail });
}

// --- at the gate -----------------------------------------------------------------

export function useAttendeeMerch(key: string | null, eventId: number, registrationId: string | null) {
  return useQuery({ queryKey: ["gate", eventId, "merch", registrationId], queryFn: () => fetchAttendeeMerch(key, eventId, registrationId!), enabled: !!registrationId, staleTime: 5_000 });
}
export function useCollectMerch(key: string | null, eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: { registration_id: string; variant_label?: string; door?: string | null } }) => collectMerch(key, eventId, itemId, body),
    onSuccess: (_r, v) => void qc.invalidateQueries({ queryKey: ["gate", eventId, "merch", v.body.registration_id] }),
  });
}
