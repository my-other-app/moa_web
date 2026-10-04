"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { staleTimes } from "@moa/app-kit";
import {
  awardBadge,
  createBadge,
  deleteBadge,
  fetchBadgeRecipients,
  fetchBadgeStats,
  fetchBadges,
  revokeBadge,
  updateBadge,
} from "./api";
import type { BadgeFormInput } from "./schemas";

export function useBadges() {
  return useQuery({
    queryKey: qk.badges.list({}),
    queryFn: fetchBadges,
    staleTime: staleTimes.reference,
  });
}

export function useBadgeStats(badgeId: number) {
  return useQuery({
    queryKey: qk.badges.stats(badgeId),
    queryFn: () => fetchBadgeStats(badgeId),
    staleTime: staleTimes.analytics,
  });
}

export function useBadgeRecipients(badgeId: number) {
  return useQuery({
    queryKey: qk.badges.recipients(badgeId),
    queryFn: () => fetchBadgeRecipients(badgeId),
  });
}

/**
 * Awarding or revoking changes the holder's own badge list too, which the
 * user detail page reads, so that subtree is invalidated alongside badges.
 */
async function invalidateBadges(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.badges.all }),
    queryClient.invalidateQueries({ queryKey: qk.users.all }),
    queryClient.invalidateQueries({ queryKey: qk.clubs.all }),
  ]);
}

export function useCreateBadge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BadgeFormInput) => createBadge(input),
    onSuccess: async () => {
      toast.success("Badge created");
      await invalidateBadges(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateBadge(badgeId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BadgeFormInput) => updateBadge(badgeId, input),
    onSuccess: async () => {
      toast.success("Badge updated");
      await invalidateBadges(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteBadge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBadge,
    onSuccess: async () => {
      toast.success("Badge deleted");
      await invalidateBadges(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useAwardBadge(badgeId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entityId: number) => awardBadge(badgeId, entityId),
    onSuccess: async () => {
      toast.success("Badge awarded");
      await invalidateBadges(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRevokeBadge(badgeId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entityId: number) => revokeBadge(badgeId, entityId),
    onSuccess: async () => {
      toast.success("Badge revoked");
      await invalidateBadges(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
