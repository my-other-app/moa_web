"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import { createLink, deleteLink, fetchLinkDetail, fetchLinksOverview, updateLink, type LinkPatch } from "./api";
import type { LinkForm, LinkScope } from "./schemas";

const key = (scope: LinkScope) => (scope.kind === "event" ? (["links", "event", scope.eventId] as const) : (["links", "club"] as const));

export function useLinksOverview(scope: LinkScope, days: number) {
  return useQuery({
    queryKey: [...key(scope), "overview", days],
    queryFn: () => fetchLinksOverview(scope, days),
    staleTime: 15_000,
  });
}

export function useLinkDetail(scope: LinkScope, id: string | null, days: number) {
  return useQuery({
    queryKey: [...key(scope), "detail", id, days],
    queryFn: () => fetchLinkDetail(scope, id as string, days),
    enabled: id !== null,
    staleTime: 15_000,
  });
}

/** A new link is made in the scope it points to; the club's page lists every scope, so all of them are refreshed. */
export function useCreateLink(scope: LinkScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ form, target }: { form: LinkForm; target?: LinkScope }) => createLink(target ?? scope, form),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["links"] }),
    onError: toastError,
  });
}

export function useDeleteLink(scope: LinkScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, target }: { id: string; target?: LinkScope }) => deleteLink(target ?? scope, id),
    onSuccess: () => {
      toast.success("Link retired. What it already brought stays counted.");
      void queryClient.invalidateQueries({ queryKey: ["links"] });
    },
    onError: toastError,
  });
}

/** Rename or retag a link where it belongs (an event's link from the club page goes to that event). */
export function useUpdateLink(scope: LinkScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, target }: { id: string; patch: LinkPatch; target?: LinkScope }) => updateLink(target ?? scope, id, patch),
    onSuccess: () => {
      toast.success("Link saved. Its code and everything it brought stay the same.");
      void queryClient.invalidateQueries({ queryKey: ["links"] });
    },
    onError: toastError,
  });
}
