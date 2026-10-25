"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import { disableTwoFactor, enableTwoFactor, fetchSecurity, renewRecoveryCodes, revokeSession, setNotifyNewDevice, signOutOthers, startTwoFactor } from "./api";

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
    onError: toastError,
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
    onError: toastError,
  });
}

export function useNotifyNewDevice() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (on: boolean) => setNotifyNewDevice(on),
    onSuccess: refresh,
    onError: toastError,
  });
}

export function useStartTwoFactor() {
  return useMutation({ mutationFn: () => startTwoFactor(), onError: toastError });
}

export function useEnableTwoFactor() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (code: string) => enableTwoFactor(code),
    onSuccess: () => {
      toast.success("Two-factor sign-in is on");
      refresh();
    },
    onError: toastError,
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
    onError: toastError,
  });
}

/** An admin acting as the club: the club's second factor is the club's own business. */
export const IMPERSONATING_MESSAGE =
  "You're signed in as this club from MyOtherApp's admin. Only the club's own sign-in can make new recovery codes.";

export function useRenewRecoveryCodes() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (code: string) => renewRecoveryCodes(code),
    onSuccess: () => {
      toast.success("New recovery codes made. The old ones no longer work.");
      refresh();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.errorCode === "NOT_WHILE_IMPERSONATING") {
        toast.error(IMPERSONATING_MESSAGE);
        return;
      }
      toastError(error);
    },
  });
}
