"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { createAgendaItem, deleteAgendaItem, fetchAgenda, updateAgendaItem } from "./api";
import type { AgendaItemInput } from "./schemas";

const key = (eventId: number) => [...qk.events.detail(eventId), "agenda"] as const;

export function useAgenda(eventId: number) {
  return useQuery({ queryKey: key(eventId), queryFn: () => fetchAgenda(eventId), staleTime: 10_000 });
}
function useRefresh(eventId: number) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: key(eventId) });
}
export function useCreateAgendaItem(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (body: AgendaItemInput) => createAgendaItem(eventId, body), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
}
export function useUpdateAgendaItem(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<AgendaItemInput> }) => updateAgendaItem(eventId, id, body), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
}
export function useDeleteAgendaItem(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (id: string) => deleteAgendaItem(eventId, id), onSuccess: () => (toast.success("Block removed"), refresh()), onError: (e: Error) => toast.error(e.message) });
}
