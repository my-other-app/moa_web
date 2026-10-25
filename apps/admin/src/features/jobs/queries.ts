"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nullIfRouteMissing } from "@moa/api";
import { toast } from "@moa/ui";

import { cancelJob, fetchJobQueue, fetchJobs, retryJob } from "./api";
import type { JobState } from "./schemas";

const KEY = ["admin", "jobs"] as const;

export function useJobQueue() {
  return useQuery({ queryKey: [...KEY, "queue"], queryFn: fetchJobQueue, refetchInterval: 30_000 });
}

/** The jobs one by one; null on a backend that has only the queue (no /items route). */
export function useJobs(state: JobState, offset: number, limit: number, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "items", state, offset, limit],
    queryFn: () => nullIfRouteMissing(() => fetchJobs(state, offset, limit)),
    placeholderData: keepPreviousData,
    enabled,
  });
}

function useJobAction(fn: (id: number) => Promise<void>, done: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      toast.success(done);
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error: Error) => toast.error(error.message || "That did not work"),
  });
}

export const useRetryJob = () => useJobAction(retryJob, "Back in the queue");
export const useCancelJob = () => useJobAction(cancelJob, "Job cancelled");
