"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { fetchCloseoutSettings, fetchFigures, fetchReports, fetchRetention, generateReport, runRetention, updateCloseoutSettings } from "./api";
import type { SettingsPatch } from "./schemas";

const key = (eventId: number) => [...qk.events.detail(eventId), "closeout"] as const;

export function useFigures(eventId: number) {
  return useQuery({ queryKey: [...key(eventId), "figures"], queryFn: () => fetchFigures(eventId), staleTime: 15_000 });
}
export function useReports(eventId: number) {
  return useQuery({ queryKey: [...key(eventId), "reports"], queryFn: () => fetchReports(eventId), staleTime: 15_000 });
}
export function useCloseoutSettings(eventId: number) {
  return useQuery({ queryKey: [...key(eventId), "settings"], queryFn: () => fetchCloseoutSettings(eventId), staleTime: 10_000 });
}
export function useRetention(eventId: number) {
  return useQuery({ queryKey: [...key(eventId), "retention"], queryFn: () => fetchRetention(eventId), staleTime: 10_000, refetchOnWindowFocus: true });
}
function useRefresh(eventId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: key(eventId) });
    void qc.invalidateQueries({ queryKey: qk.events.detail(eventId) });
  };
}
export function useGenerateReport(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: () => generateReport(eventId), onSuccess: (r) => (toast.success("Report generated", { description: r.filename }), refresh()), onError: (e: Error) => toast.error(e.message) });
}
export function useUpdateCloseoutSettings(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (body: SettingsPatch) => updateCloseoutSettings(eventId, body), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
}
export function useRunRetention(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (confirmSlug: string) => runRetention(eventId, confirmSlug), onSuccess: refresh });
}
