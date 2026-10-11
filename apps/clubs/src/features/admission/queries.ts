"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { fetchAdmission, numberEveryone, updateAdmission } from "./api";

const key = (eventId: number) => [...qk.events.detail(eventId), "admission"] as const;

export function useAdmission(eventId: number) {
  return useQuery({ queryKey: key(eventId), queryFn: () => fetchAdmission(eventId), staleTime: 10_000 });
}
export function useUpdateAdmission(eventId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: Parameters<typeof updateAdmission>[1]) => updateAdmission(eventId, body), onSuccess: () => void qc.invalidateQueries({ queryKey: key(eventId) }), onError: (e: Error) => toast.error(e.message) });
}
export function useNumberEveryone(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => numberEveryone(eventId),
    onSuccess: (r) => {
      toast.success(r.numbered ? `${r.numbered} numbered` : "Everyone already has a number", { description: r.numbered ? `${r.first} to ${r.last}` : undefined });
      void qc.invalidateQueries({ queryKey: key(eventId) });
      void qc.invalidateQueries({ queryKey: qk.events.registrations(eventId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
