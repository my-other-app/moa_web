"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import {
  createInterest,
  createInterestCategory,
  deleteInterest,
  fetchInterestCategories,
  updateInterest,
} from "./api";
import type { InterestFormInput } from "./schemas";

export function useInterestCategories() {
  return useQuery({
    queryKey: qk.interests.all,
    queryFn: fetchInterestCategories,
    staleTime: staleTimes.reference,
  });
}

/**
 * Interests appear on club, event and user profiles, so a change here moves
 * all three.
 */
async function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.interests.all }),
    queryClient.invalidateQueries({ queryKey: qk.clubs.all }),
    queryClient.invalidateQueries({ queryKey: qk.users.all }),
    queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
  ]);
}

export function useCreateInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InterestFormInput) => createInterest(input),
    onSuccess: async () => {
      toast.success("Interest added");
      await invalidate(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: InterestFormInput }) =>
      updateInterest(id, input),
    onSuccess: async () => {
      toast.success("Interest updated");
      await invalidate(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteInterest,
    onSuccess: async (result) => {
      toast.success(
        result.detached_from > 0
          ? `Interest deleted and removed from ${result.detached_from} records`
          : "Interest deleted"
      );
      await invalidate(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useCreateInterestCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createInterestCategory,
    onSuccess: async () => {
      toast.success("Category added");
      await invalidate(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
