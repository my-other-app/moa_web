"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import {
  checkSiteDomain,
  connectSiteDomain,
  deleteSiteImage,
  fetchSite,
  fetchSiteAnalytics,
  fetchSiteDomain,
  orderSiteImages,
  patchSite,
  patchSiteImage,
  previewSite,
  publishSite,
  removeSiteDomain,
} from "./api";
import { DOMAINS_UNAVAILABLE, NOT_ON_THIS_SERVER, domainPollInterval, isRoleRefusal, type SiteDomain } from "./domain";
import { sortImages } from "./layout";
import type { Site, SiteImage, SitePatch } from "./schemas";

export const SITE_KEY = ["club-site"] as const;
const KEY = SITE_KEY;

export function useSite() {
  return useQuery({ queryKey: KEY, queryFn: fetchSite, staleTime: 10_000 });
}

/**
 * The page as the current choices would make it; keyed on them (and on the
 * photo library, `version`) so each edit re-renders once the typing settles.
 * The caller debounces `patch`.
 */
export function usePreview(patch: SitePatch, enabled: boolean, version = "") {
  return useQuery({ queryKey: [...KEY, "preview", patch, version], queryFn: () => previewSite(patch), enabled, staleTime: 60_000, placeholderData: (prev) => prev, retry: false });
}

/** What the site brought. Not retried: a server without site tracking answers 404 and the panel stays away. */
export function useSiteAnalytics(days: number, enabled: boolean) {
  return useQuery({ queryKey: [...KEY, "analytics", days], queryFn: () => fetchSiteAnalytics(days), enabled, staleTime: 30_000, retry: false });
}

export function usePatchSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SitePatch) => patchSite(patch),
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      // What the server's layout check changed in what was sent (the editor sends what fits, so rarely anything).
      const left = Object.values(data.adjusted ?? {}).flat();
      if (left.length) toast.info(`Adjusted to fit the template: ${[...new Set(left)].join(", ")}`);
    },
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

// ─── The photo library ───────────────────────────────────────────────────

/** Writes the library into the site as read, keeping it in its order. */
export function useSetImages() {
  const queryClient = useQueryClient();
  return (update: (images: SiteImage[]) => SiteImage[]) =>
    queryClient.setQueryData<Site>(KEY, (s) => (s ? { ...s, images: sortImages(update(s.images ?? [])).map((i, position) => ({ ...i, position })) } : s));
}

/** After a library change the server's word wins: slots it cleared, used_in, a republished page. */
function useRefreshSite() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: KEY, exact: true });
}

export function useImageAlt() {
  const setImages = useSetImages();
  const refresh = useRefreshSite();
  return useMutation({
    mutationFn: ({ id, alt }: { id: number; alt: string | null }) => patchSiteImage(id, { alt }),
    onMutate: ({ id, alt }) => setImages((list) => list.map((i) => (i.id === id ? { ...i, alt } : i))),
    onSuccess: (image) => {
      if (image) setImages((list) => list.map((i) => (i.id === image.id ? { ...i, ...image } : i)));
      toast.success("Alt text saved");
    },
    onError: toastError,
    // Whether the live page is behind now.
    onSettled: refresh,
  });
}

/** The library in a new order, shown at once; put back if the server refuses it. */
export function useOrderImages() {
  const queryClient = useQueryClient();
  const setImages = useSetImages();
  const refresh = useRefreshSite();
  return useMutation({
    mutationFn: (ids: number[]) => orderSiteImages(ids),
    onMutate: (ids) => {
      const before = queryClient.getQueryData<Site>(KEY)?.images ?? null;
      const rank = new Map(ids.map((id, i) => [id, i]));
      setImages((list) => list.map((i) => ({ ...i, position: rank.get(i.id) ?? ids.length })));
      return { before };
    },
    onSuccess: (images) => {
      if (images) setImages(() => images);
    },
    onError: (error, _ids, context) => {
      if (context?.before) setImages(() => context.before ?? []);
      toastError(error);
    },
    onSettled: refresh,
  });
}

export function useDeleteImage() {
  const setImages = useSetImages();
  const queryClient = useQueryClient();
  const refresh = useRefreshSite();
  return useMutation({
    mutationFn: (id: number) => deleteSiteImage(id),
    onSuccess: (images, id) => {
      setImages((list) => images ?? list.filter((i) => i.id !== id));
      // The server takes it out of every slot; so does the site as read.
      queryClient.setQueryData<Site>(KEY, (s) =>
        s?.layout ? { ...s, layout: { ...s.layout, slots: Object.fromEntries(Object.entries(s.layout.slots).filter(([, v]) => v !== id)) } } : s,
      );
      toast.success("Photo deleted");
      refresh();
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
