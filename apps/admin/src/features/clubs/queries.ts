"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import {
  approveClub,
  deleteClub,
  fetchClub,
  fetchClubEvents,
  fetchClubFollowers,
  fetchClubs,
  fetchDeletedClubs,
  restoreClub,
  rejectClub,
  updateClub,
  type ClubListQuery,
  type SubListQuery,
} from "./api";
import type { ClubEditInput } from "./schemas";

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

export function useClub(clubId: number) {
  return useQuery({
    queryKey: qk.clubs.detail(clubId),
    queryFn: () => fetchClub(clubId),
  });
}

export function useClubFollowers(clubId: number, query: SubListQuery) {
  return useQuery({
    queryKey: [...qk.clubs.followers(clubId), query],
    queryFn: () => fetchClubFollowers(clubId, query),
    placeholderData: keepPreviousData,
  });
}

export function useClubEvents(clubId: number, query: SubListQuery) {
  return useQuery({
    queryKey: [...qk.clubs.events(clubId), query],
    queryFn: () => fetchClubEvents(clubId, query),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateClub(clubId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClubEditInput) => updateClub(clubId, input),
    onSuccess: async () => {
      toast.success("Club updated");
      await queryClient.invalidateQueries({ queryKey: qk.clubs.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteClub,
    onSuccess: async () => {
      toast.success("Club deleted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.clubs.all }),
        queryClient.invalidateQueries({ queryKey: qk.analytics.all }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeletedClubs(query: { offset: number; limit: number }) {
  return useQuery({
    queryKey: [...qk.clubs.all, "deleted", query],
    queryFn: () => fetchDeletedClubs(query),
    placeholderData: keepPreviousData,
  });
}

export function useRestoreClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: restoreClub,
    onSuccess: async () => {
      toast.success("Club restored");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.clubs.all }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
        queryClient.invalidateQueries({ queryKey: qk.analytics.all }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
