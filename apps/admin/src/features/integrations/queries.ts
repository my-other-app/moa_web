"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import {
  createPartnerApp,
  fetchAllocations,
  fetchClubUsage,
  fetchPartnerApps,
  fetchPartnerClubs,
  fetchPlatformUsage,
  fetchWebhookHealth,
  resumePartnerApp,
  rotatePartnerSecret,
  saveAllocation,
  suspendPartnerApp,
  updatePartnerApp,
  type AllocationQuery,
  type PartnerQuery,
} from "./api";
import type { AllocationBody, PartnerAppBody } from "./schemas";

export const INTEGRATIONS_KEY = ["admin", "integrations"] as const;
const CLUBS_KEY = [...INTEGRATIONS_KEY, "clubs"] as const;
const PARTNERS_KEY = [...INTEGRATIONS_KEY, "partner-apps"] as const;

const fail = (fallback: string) => (error: Error) => toast.error(error.message || fallback);

export function useAllocations(query: AllocationQuery) {
  return useQuery({ queryKey: [...CLUBS_KEY, query], queryFn: () => fetchAllocations(query), placeholderData: keepPreviousData, retry: false });
}

/** True once the API is known to have integrations; false when known not to (or failing); undefined while asking. */
export function useIntegrationsOnServer(): boolean | undefined {
  // Asked by the rail on every screen: a row is enough, and the answer keeps a while.
  const q = useQuery({ queryKey: [...CLUBS_KEY, "probe"], queryFn: () => fetchAllocations({ offset: 0, limit: 1 }), staleTime: 5 * 60_000, retry: false });
  if (q.data) return true;
  if (q.data === null || q.isError) return false;
  return undefined;
}

function useRefresh() {
  const queryClient = useQueryClient();
  return (...keys: (readonly unknown[])[]) =>
    Promise.all([
      ...keys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      // Every change here is written to the activity log.
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
    ]);
}

export function useSaveAllocation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ clubId, body }: { clubId: number; clubName: string; body: AllocationBody; was: boolean }) => saveAllocation(clubId, body),
    onSuccess: async (_row, { clubName, body, was }) => {
      if (!body.allocated) toast.success(`API access taken away from ${clubName}. Its keys stop working at once.`);
      else if (!was) toast.success(`${clubName} has API access. Its owner and admins make keys under Settings → Integrations.`);
      else toast.success(`Saved ${clubName}'s API access`);
      await refresh(CLUBS_KEY);
    },
    onError: fail("Could not save it"),
  });
}

export function useClubUsage(clubId: number | null) {
  return useQuery({ queryKey: [...CLUBS_KEY, clubId, "usage"], queryFn: () => fetchClubUsage(clubId!), enabled: clubId !== null, staleTime: 5 * 60_000, retry: false });
}

export function usePlatformUsage(enabled = true) {
  return useQuery({ queryKey: [...INTEGRATIONS_KEY, "usage"], queryFn: () => fetchPlatformUsage(), enabled, staleTime: 5 * 60_000, retry: false });
}

export function usePartnerApps(query: PartnerQuery) {
  return useQuery({ queryKey: [...PARTNERS_KEY, query], queryFn: () => fetchPartnerApps(query), placeholderData: keepPreviousData });
}

/** Registers an app. The secret comes back once, to the caller: nothing here keeps it. */
export function useCreatePartnerApp() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: PartnerAppBody) => createPartnerApp(body),
    onSuccess: () => refresh(PARTNERS_KEY),
    onError: fail("Could not register it"),
  });
}

export function useUpdatePartnerApp() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ appId, body }: { appId: string; body: PartnerAppBody }) => updatePartnerApp(appId, body),
    onSuccess: async (app) => {
      toast.success(`Saved ${app.name}`);
      await refresh(PARTNERS_KEY);
    },
    onError: fail("Could not save it"),
  });
}

export function useSuspendPartnerApp() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ appId, suspend }: { appId: string; suspend: boolean }) => (suspend ? suspendPartnerApp(appId) : resumePartnerApp(appId)),
    onSuccess: async (app, { suspend }) => {
      toast.success(suspend ? `${app.name} suspended. It can't reach any club until it is resumed.` : `${app.name} resumed. Clubs connected to it work again.`);
      await refresh(PARTNERS_KEY);
    },
    onError: fail("Could not change it"),
  });
}

export function useRotatePartnerSecret() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (appId: string) => rotatePartnerSecret(appId),
    onSuccess: () => refresh(PARTNERS_KEY),
    onError: fail("Could not make a new secret"),
  });
}

export function usePartnerClubs(appId: string | null) {
  return useQuery({ queryKey: [...PARTNERS_KEY, appId, "clubs"], queryFn: () => fetchPartnerClubs(appId!), enabled: appId !== null, retry: false });
}

export function useWebhookHealth() {
  return useQuery({ queryKey: [...INTEGRATIONS_KEY, "webhooks", "health"], queryFn: () => fetchWebhookHealth(7), staleTime: 60_000, retry: false });
}
