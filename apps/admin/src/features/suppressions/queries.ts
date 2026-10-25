"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { fetchSuppressions, unblockAddress, type SuppressionQuery } from "./api";

const KEY = ["admin", "suppressions"] as const;

export function useSuppressions(query: SuppressionQuery) {
  return useQuery({ queryKey: [...KEY, query], queryFn: () => fetchSuppressions(query), placeholderData: keepPreviousData });
}

export function useUnblockAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unblockAddress,
    onSuccess: async (_d, email) => {
      toast.success(`${email} gets mail again`);
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error: Error) => toast.error(error.message || "Could not take it off the list"),
  });
}
