"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import {
  createPartnerApp,
  disconnectPartnerClub,
  fetchAllocations,
  fetchClubDetail,
  fetchPartnerApp,
  fetchPartnerApps,
  fetchPlatformUsage,
  fetchWebhookHealth,
  resumePartnerApp,
  revokeClubKey,
  rotatePartnerSecret,
  saveAllocation,
  setEndpointEnabled,
  suspendPartnerApp,
  updatePartnerApp,
  type AllocationQuery,
  type PartnerQuery,
} from "./api";
import type { AllocationBody, PartnerAppBody } from "./schemas";

export const INTEGRATIONS_KEY = ["admin", "integrations"] as const;
const CLUBS_KEY = [...INTEGRATIONS_KEY, "clubs"] as const;
const PARTNERS_KEY = [...INTEGRATIONS_KEY, "partner-apps"] as const;
const HEALTH_KEY = [...INTEGRATIONS_KEY, "webhooks", "health"] as const;

const fail = (fallback: string) => (error: Error) => toast.error(error.message || fallback);

export function useAllocations(query: AllocationQuery) {
  return useQuery({ queryKey: [...CLUBS_KEY, "list", query], queryFn: () => fetchAllocations(query), placeholderData: keepPreviousData, retry: false });
}

/** True once the API is known to have integrations; false when known not to (or failing); undefined while asking. */
export function useIntegrationsOnServer(): boolean | undefined {
  // Asked by the rail on every screen: the answer keeps a while.
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
      if (!body.enabled) toast.success(`API access taken away from ${clubName}. Its keys are refused from now on.`);
      else if (!was) toast.success(`${clubName} has API access. Its owner and admins make keys under Settings → Integrations.`);
      else toast.success(`Saved ${clubName}'s API access`);
      await refresh(CLUBS_KEY);
    },
    onError: fail("Could not save it"),
  });
}

export function useClubDetail(clubId: number | null) {
  return useQuery({ queryKey: [...CLUBS_KEY, clubId, "detail"], queryFn: () => fetchClubDetail(clubId!), enabled: clubId !== null, staleTime: 60_000, retry: false });
}

export function useRevokeClubKey(clubId: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (keyId: string) => revokeClubKey(keyId),
    onSuccess: async () => {
      toast.success("Key revoked. Anything still using it is refused from now on.");
      await refresh([...CLUBS_KEY, clubId], [...CLUBS_KEY, "list"]);
    },
    onError: fail("Could not revoke it"),
  });
}

export function usePlatformUsage(enabled = true) {
  return useQuery({ queryKey: [...INTEGRATIONS_KEY, "usage"], queryFn: () => fetchPlatformUsage(), enabled, staleTime: 5 * 60_000, retry: false });
}

export function usePartnerApps(query: PartnerQuery) {
  return useQuery({ queryKey: [...PARTNERS_KEY, "list", query], queryFn: () => fetchPartnerApps(query), placeholderData: keepPreviousData });
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
    mutationFn: ({ appId, suspend, reason }: { appId: string; suspend: boolean; reason?: string | null }) => (suspend ? suspendPartnerApp(appId, reason ?? null) : resumePartnerApp(appId)),
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

export function usePartnerApp(appId: string | null) {
  return useQuery({ queryKey: [...PARTNERS_KEY, appId, "detail"], queryFn: () => fetchPartnerApp(appId!), enabled: appId !== null, retry: false });
}

export function useDisconnectPartnerClub(appId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ connectionId }: { connectionId: string; clubName: string }) => disconnectPartnerClub(appId, connectionId),
    onSuccess: async (_r, { clubName }) => {
      toast.success(`${clubName} disconnected. The app can't reach it any more.`);
      await refresh(PARTNERS_KEY);
    },
    onError: fail("Could not disconnect it"),
  });
}

export function useWebhookHealth() {
  return useQuery({ queryKey: HEALTH_KEY, queryFn: () => fetchWebhookHealth(7), staleTime: 60_000, retry: false });
}

export function useSetEndpointEnabled() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ endpointId, enabled }: { endpointId: string; enabled: boolean; url: string }) => setEndpointEnabled(endpointId, enabled),
    onSuccess: async (_r, { enabled, url }) => {
      toast.success(enabled ? `Turned on: ${url}` : `Turned off: ${url}. The club sees it was MyOtherApp.`);
      await refresh(HEALTH_KEY);
    },
    onError: fail("Could not change it"),
  });
}
