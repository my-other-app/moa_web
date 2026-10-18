"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import { checkSiteDomain, connectSiteDomain, fetchSite, fetchSiteAnalytics, fetchSiteDomain, patchSite, previewSite, publishSite, removeSiteDomain } from "./api";
import { DOMAINS_UNAVAILABLE, NOT_ON_THIS_SERVER, domainPollInterval, isRoleRefusal, type SiteDomain } from "./domain";
import type { SitePatch } from "./schemas";

const KEY = ["club-site"] as const;

export function useSite() {
  return useQuery({ queryKey: KEY, queryFn: fetchSite, staleTime: 10_000 });
}

/** The page as the current choices would make it; keyed on them so each edit re-renders once the typing settles. */
export function usePreview(patch: SitePatch, enabled: boolean) {
  return useQuery({ queryKey: [...KEY, "preview", patch], queryFn: () => previewSite(patch), enabled, staleTime: 60_000, placeholderData: (prev) => prev });
}

/** What the site brought. Not retried: a server without site tracking answers 404 and the panel stays away. */
export function useSiteAnalytics(days: number, enabled: boolean) {
  return useQuery({ queryKey: [...KEY, "analytics", days], queryFn: () => fetchSiteAnalytics(days), enabled, staleTime: 30_000, retry: false });
}

export function usePatchSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SitePatch) => patchSite(patch),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
    onError: toastError,
  });
}

export function usePublishSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishSite,
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      void queryClient.invalidateQueries({ queryKey: [...KEY, "analytics"] });
      toast.success("Site updated");
    },
    onError: toastError,
  });
}

// ─── The club's own domain ───────────────────────────────────────────────

export const DOMAIN_KEY = ["club-site-domain"] as const;

async function readDomain(): Promise<SiteDomain> {
  try {
    return await fetchSiteDomain();
  } catch (error) {
    // No route at all (a bare 404, no code) is a server from before custom domains: none to be had yet.
    if (error instanceof ApiError && error.isNotFound && !error.errorCode) return NOT_ON_THIS_SERVER;
    throw error;
  }
}

/**
 * The domain, read again every 30 seconds while it is pending and the page
 * is open (React Query stops when the page goes, and while the tab is in the
 * background); once it is live, failed or gone, it is not polled.
 */
export function useSiteDomain() {
  return useQuery({ queryKey: DOMAIN_KEY, queryFn: readDomain, staleTime: 10_000, retry: false, refetchInterval: (query) => domainPollInterval(query.state.data) });
}

/** After a write: the answer is the domain as it now is, and the site's address may have moved with it. */
function useSettle() {
  const queryClient = useQueryClient();
  return (data: SiteDomain) => {
    queryClient.setQueryData(DOMAIN_KEY, data);
    void queryClient.invalidateQueries({ queryKey: KEY, exact: true });
  };
}

/**
 * Connects a domain. Its refusals are shown under the field by the card,
 * not toasted; a plan refusal opens the upgrade dialog (PlanLockHost), and
 * either that or "unavailable" means the card is out of date, so it is read
 * again.
 */
export function useConnectDomain() {
  const queryClient = useQueryClient();
  const settle = useSettle();
  return useMutation({
    mutationFn: (host: string) => connectSiteDomain(host),
    onSuccess: settle,
    onError: (error) => {
      if (error instanceof ApiError && (error.errorCode === DOMAINS_UNAVAILABLE || error.isForbidden)) void queryClient.invalidateQueries({ queryKey: DOMAIN_KEY });
    },
  });
}

/** Toasts a failed check or removal, except a role's refusal (the card turns read-only) or the plan's (the dialog). */
function toastUnlessRole(error: unknown) {
  if (isRoleRefusal(error)) return;
  toastError(error);
}

export function useCheckDomain() {
  const settle = useSettle();
  return useMutation({
    mutationFn: checkSiteDomain,
    onSuccess: (data) => {
      settle(data);
      const d = data.domain;
      if (d?.status === "active") toast.success(`Your site is live at ${d.host}`);
      else if (d?.status === "pending") toast.info("Not found yet. We'll keep checking.");
    },
    onError: toastUnlessRole,
  });
}

export function useRemoveDomain() {
  const settle = useSettle();
  return useMutation({
    mutationFn: removeSiteDomain,
    onSuccess: (data) => {
      settle(data);
      toast.success(`Domain removed. Your site is at ${data.default_host}.`);
    },
    onError: toastUnlessRole,
  });
}
