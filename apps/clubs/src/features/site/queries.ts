"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { fetchSite, patchSite, previewSite, publishSite } from "./api";
import type { SitePatch } from "./schemas";

const KEY = ["club-site"] as const;

export function useSite() {
  return useQuery({ queryKey: KEY, queryFn: fetchSite, staleTime: 10_000 });
}

/** The page as the current choices would make it; keyed on them so each edit re-renders once the typing settles. */
export function usePreview(patch: SitePatch, enabled: boolean) {
  return useQuery({ queryKey: [...KEY, "preview", patch], queryFn: () => previewSite(patch), enabled, staleTime: 60_000, placeholderData: (prev) => prev });
}

export function usePatchSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SitePatch) => patchSite(patch),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
    onError: (error: Error) => toast.error(error.message),
  });
}

export function usePublishSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishSite,
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      toast.success("Site updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
