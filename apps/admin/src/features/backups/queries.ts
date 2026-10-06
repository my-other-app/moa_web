"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { createBackup, deleteBackup, fetchBackups } from "./api";

const key = ["admin", "backups"] as const;

export function useBackups() {
  return useQuery({
    queryKey: key,
    queryFn: fetchBackups,
    staleTime: staleTimes.volatile,
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBackup,
    onSuccess: async (backup) => {
      await queryClient.invalidateQueries({ queryKey: key });
      toast.success(`Snapshot taken — ${backup.name}`);
    },
    onError: (error) => toast.error(error.message || "Could not take a snapshot"),
  });
}

export function useDeleteBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
      toast.success("Snapshot deleted");
    },
    onError: (error) => toast.error(error.message || "Could not delete it"),
  });
}

export { qk };
