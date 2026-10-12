"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { disableTwoFactor, enableTwoFactor, fetchSecurity, revokeSession, setNotifyNewDevice, signOutOthers, startTwoFactor } from "./api";

const KEY = ["security"] as const;

export function useSecurity() {
  return useQuery({ queryKey: KEY, queryFn: fetchSecurity, staleTime: 10_000, refetchInterval: 60_000 });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: KEY });
}

export function useRevokeSession() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: () => {
      toast.success("Session signed out");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSignOutOthers() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: () => signOutOthers(),
    onSuccess: (n) => {
      toast.success(n === 0 ? "No other sessions were open" : `Signed out ${n} other ${n === 1 ? "session" : "sessions"}`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useNotifyNewDevice() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (on: boolean) => setNotifyNewDevice(on),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useStartTwoFactor() {
  return useMutation({ mutationFn: () => startTwoFactor(), onError: (error: Error) => toast.error(error.message) });
}

export function useEnableTwoFactor() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (code: string) => enableTwoFactor(code),
    onSuccess: () => {
      toast.success("Two-factor sign-in is on");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDisableTwoFactor() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (code: string) => disableTwoFactor(code),
    onSuccess: () => {
      toast.success("Two-factor sign-in is off");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
