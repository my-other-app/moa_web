"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { fetchPlatformTemplates } from "./api";

const KEY = ["admin", "whatsapp-templates"] as const;

export function usePlatformTemplates() {
  return useQuery({ queryKey: KEY, queryFn: () => fetchPlatformTemplates(false), staleTime: 60_000 });
}

/** Ask Meta again now (the server keeps its answer ten minutes otherwise). */
export function useRefreshTemplates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchPlatformTemplates(true),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
    onError: (error: Error) => toast.error(error.message || "Meta did not answer"),
  });
}
