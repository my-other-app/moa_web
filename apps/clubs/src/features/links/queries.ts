"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { createLink, deleteLink, fetchLinks, updateLink } from "./api";
import type { LinkForm, LinkScope } from "./schemas";

const key = (scope: LinkScope) => (scope.kind === "event" ? (["links", "event", scope.eventId] as const) : (["links", "club"] as const));

export function useLinks(scope: LinkScope, days: number) {
  return useQuery({
    queryKey: [...key(scope), days],
    queryFn: () => fetchLinks(scope, days),
    staleTime: 15_000,
  });
}

export function useCreateLink(scope: LinkScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: LinkForm) => createLink(scope, form),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key(scope) }),
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateLink(scope: LinkScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<LinkForm> }) => updateLink(scope, id, patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key(scope) }),
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteLink(scope: LinkScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLink(scope, id),
    onSuccess: () => {
      toast.success("Link retired. What it already brought stays counted.");
      void queryClient.invalidateQueries({ queryKey: key(scope) });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
