"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { approveClub, fetchClubs, rejectClub, type ClubListQuery } from "./api";

export function useClubs(query: ClubListQuery) {
  return useQuery({
    queryKey: qk.clubs.list(query),
    queryFn: () => fetchClubs(query),
    placeholderData: keepPreviousData,
  });
}

export function useApproveClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveClub,
    onSuccess: async (_data, clubId) => {
      toast.success("Club approved");
      // Prefix invalidation clears every cached club list regardless of the
      // search/page it was fetched under, plus the dashboard counters that
      // include a verified-club total.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.clubs.all }),
        queryClient.invalidateQueries({ queryKey: qk.analytics.all }),
      ]);
      void clubId;
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRejectClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rejectClub,
    onSuccess: async () => {
      toast.success("Club rejected and removed");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.clubs.all }),
        queryClient.invalidateQueries({ queryKey: qk.analytics.all }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
