"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import {
  disableTotp,
  enableTotp,
  fetchSessions,
  fetchTotpStatus,
  revokeAllSessions,
  revokeSession,
  startTotpSetup,
} from "./api";

export function useTotpStatus() {
  return useQuery({ queryKey: ["2fa"], queryFn: fetchTotpStatus });
}

export function useSessions() {
  return useQuery({ queryKey: ["sessions"], queryFn: fetchSessions });
}

export function useStartTotpSetup() {
  return useMutation({
    mutationFn: startTotpSetup,
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useEnableTotp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: enableTotp,
    onSuccess: async () => {
      toast.success("Two-factor is on");
      await queryClient.invalidateQueries({ queryKey: ["2fa"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDisableTotp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disableTotp,
    onSuccess: async () => {
      toast.success("Two-factor is off");
      await queryClient.invalidateQueries({ queryKey: ["2fa"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeSession,
    onSuccess: async () => {
      toast.success("Signed that session out");
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRevokeAllSessions() {
  return useMutation({
    mutationFn: revokeAllSessions,
    onError: (error: Error) => toast.error(error.message),
  });
}
