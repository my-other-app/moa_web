"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { OPS_ME_KEY } from "@/features/ops/queries";

import { fetchSettings, resetSetting, updateSetting } from "./api";

const KEY = ["admin", "settings"] as const;

export function useSettings() {
  return useQuery({ queryKey: KEY, queryFn: fetchSettings });
}

async function refresh(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: KEY }),
    // The maintenance banner and the two-factor rule are read from the probe.
    queryClient.invalidateQueries({ queryKey: OPS_ME_KEY }),
  ]);
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => updateSetting(key, value),
    onSuccess: async (setting) => {
      toast.success(`${setting.label} saved`);
      await refresh(queryClient);
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the setting"),
  });
}

export function useResetSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetSetting,
    onSuccess: async (setting) => {
      toast.success(`${setting.label} is back to the server's value`);
      await refresh(queryClient);
    },
    onError: (error: Error) => toast.error(error.message || "Could not reset the setting"),
  });
}
