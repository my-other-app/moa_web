"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { fetchMyClub, updateClubLogo, updateMyClub } from "./api";
import type { ClubProfileForm } from "./schemas";

export function useMyClub() {
  return useQuery({
    queryKey: qk.clubs.self(),
    queryFn: fetchMyClub,
    staleTime: staleTimes.analytics,
  });
}

export function useUpdateMyClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClubProfileForm) => updateMyClub(input),
    onSuccess: async () => {
      toast.success("Club profile updated");
      await queryClient.invalidateQueries({ queryKey: qk.clubs.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateClubLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => updateClubLogo(file),
    onSuccess: async () => {
      toast.success("Logo updated");
      await queryClient.invalidateQueries({ queryKey: qk.clubs.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
