"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import { fetchKioskContext, fetchKioskSettings, fetchKiosks, fetchSelfQr, pairKiosk, rotateKiosk, unpairKiosk, updateKioskSettings } from "./api";
import type { KioskSettings } from "./schemas";

export function useKioskContext(token: string | null) {
  return useQuery({ queryKey: ["kiosk", token, "context"], queryFn: () => fetchKioskContext(token!), enabled: !!token, refetchInterval: 20_000, retry: 1 });
}
export function useSelfQr(token: string | null, enabled: boolean) {
  return useQuery({ queryKey: ["kiosk", token, "self-qr"], queryFn: () => fetchSelfQr(token!), enabled: !!token && enabled, refetchInterval: 15_000 });
}

const key = (eventId: number) => [...qk.events.detail(eventId), "kiosks"] as const;
export function useKiosks(eventId: number) {
  return useQuery({ queryKey: key(eventId), queryFn: () => fetchKiosks(eventId), staleTime: 10_000, refetchInterval: 30_000 });
}
export function useKioskSettings(eventId: number) {
  return useQuery({ queryKey: [...key(eventId), "settings"], queryFn: () => fetchKioskSettings(eventId), staleTime: 10_000 });
}
function useRefresh(eventId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: key(eventId) });
    void qc.invalidateQueries({ queryKey: [...qk.events.detail(eventId), "team"] });
  };
}
export function usePairKiosk(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (body: { name: string; door_id?: string | null; shift_hours?: number }) => pairKiosk(eventId, body), onSuccess: refresh, onError: toastError });
}
export function useRotateKiosk(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: ({ deviceId, shiftHours }: { deviceId: string; shiftHours?: number }) => rotateKiosk(eventId, deviceId, shiftHours), onSuccess: refresh, onError: toastError });
}
export function useUnpairKiosk(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (deviceId: string) => unpairKiosk(eventId, deviceId), onSuccess: () => (toast.success("Kiosk unpaired"), refresh()), onError: toastError });
}
export function useUpdateKioskSettings(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (body: Partial<KioskSettings> & { kiosk_pin?: string | null }) => updateKioskSettings(eventId, body), onSuccess: () => (toast.success("Kiosk settings saved"), refresh()), onError: toastError });
}
