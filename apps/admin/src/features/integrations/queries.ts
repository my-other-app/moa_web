"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import {
  createDocsLink,
  createPartnerApp,
  disconnectPartnerClub,
  fetchAllocations,
  fetchAppDocsLinks,
  fetchClubDetail,
  fetchDocsLinks,
  fetchPartnerApp,
  fetchPartnerApps,
  fetchPlatformUsage,
  fetchWebhookHealth,
  resumePartnerApp,
  revokeClubKey,
  revokeDocsLink,
  rotatePartnerSecret,
  saveAllocation,
  setEndpointEnabled,
  suspendPartnerApp,
  updatePartnerApp,
  type AllocationQuery,
  type DocsLinkQuery,
  type PartnerQuery,
} from "./api";
import { appDocsLinkBody, docsLinkName, type AllocationBody, type DocsLink, type PartnerAppBody } from "./schemas";

export const INTEGRATIONS_KEY = ["admin", "integrations"] as const;
const CLUBS_KEY = [...INTEGRATIONS_KEY, "clubs"] as const;
const PARTNERS_KEY = [...INTEGRATIONS_KEY, "partner-apps"] as const;
const HEALTH_KEY = [...INTEGRATIONS_KEY, "webhooks", "health"] as const;
const DOCS_KEY = [...INTEGRATIONS_KEY, "docs-links"] as const;

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

// ─── Developer docs links ────────────────────────────────────────────────

export function useDocsLinks(query: DocsLinkQuery, enabled = true) {
  return useQuery({ queryKey: [...DOCS_KEY, "list", query], queryFn: () => fetchDocsLinks(query), enabled, placeholderData: keepPreviousData, retry: false });
}

/**
 * True once the API is known to have docs links and this admin may make
 * them; false when it hasn't (or the read is refused); undefined while asking.
 * Asked only for a role that may manage content: the server refuses the rest.
 */
export function useDocsOnServer(enabled: boolean): boolean | undefined {
  const q = useQuery({ queryKey: [...DOCS_KEY, "probe"], queryFn: () => fetchDocsLinks({ offset: 0, limit: 1 }), enabled, staleTime: 5 * 60_000, retry: false });
  if (!enabled) return false;
  if (q.data) return true;
  if (q.data === null || q.isError) return false;
  return undefined;
}

export function useAppDocsLinks(appId: string | null) {
  return useQuery({ queryKey: [...DOCS_KEY, "app", appId], queryFn: () => fetchAppDocsLinks(appId!), enabled: appId !== null, staleTime: 15_000, retry: false });
}

/** A tab for the docs, opened in the click itself and sent on once the link is made. */
export interface DocsTab {
  go: (url: string) => void;
  close: () => void;
}

/**
 * Opening the docs in a new tab (a seam, so tests can watch it without a
 * window). The tab opens in the click, before the link is made, so a popup
 * blocker lets it through; it is cut off from this page, then sent to the
 * link. If no tab could be opened, this page goes to the docs instead.
 */
export const docsTab = {
  open(): DocsTab {
    const w = window.open("", "_blank");
    if (w) w.opener = null;
    return {
      go: (url) => {
        if (w && !w.closed) w.location.replace(url);
        else window.location.assign(url);
      },
      close: () => {
        if (w && !w.closed) w.close();
      },
    };
  },
};

/** "Open developer docs": the admin's own link (7 days), opened in the tab made for it. */
export function useOpenDocs() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (_tab: DocsTab) => createDocsLink({ purpose: "self" }),
    onSuccess: async (made, tab) => {
      tab.go(made.url);
      await refresh(DOCS_KEY);
    },
    onError: (error: Error, tab) => {
      tab.close();
      toast.error(error.message || "Could not open the docs");
    },
  });
}

/** A 30-day link for a partner app's developers, given back once to the caller. */
export function useMakeAppDocsLink(appId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (label: string) => createDocsLink(appDocsLinkBody(appId, label)),
    onSuccess: () => refresh(DOCS_KEY),
    onError: fail("Could not make the link"),
  });
}

export function useRevokeDocsLink() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (link: DocsLink) => revokeDocsLink(link.id),
    onSuccess: async (_r, link) => {
      toast.success(`“${docsLinkName(link)}” revoked. It stops working within 5 minutes.`);
      await refresh(DOCS_KEY);
    },
    onError: fail("Could not revoke it"),
  });
}
