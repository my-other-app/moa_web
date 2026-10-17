"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import { fetchSite, fetchSiteAnalytics, patchSite, previewSite, publishSite } from "./api";
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
