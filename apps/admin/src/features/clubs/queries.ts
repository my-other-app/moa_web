"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import {
  approveClub,
  createClub,
  deleteClub,
  fetchClub,
  fetchClubEvents,
  fetchClubFollowers,
  fetchClubs,
  fetchDeletedClubs,
  rejectClub,
  restoreClub,
  type ClubListQuery,
  type SubListQuery,
  updateClub,
} from "./api";
import type { ClubEditInput } from "./schemas";

export function useClubs(query: ClubListQuery, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.clubs.list(query),
    queryFn: () => fetchClubs(query),
    placeholderData: keepPreviousData,
    // `enabled` is for the two count-only queries behind the All / Verified /
    // Awaiting segment, which ask for one row purely to read `total`.
    enabled,
  });
}

/**
 * How many clubs sit in each verification state.
 *
 * The segment labels carry counts, and each is the `total` of the list
 * filtered the same way -- read from that query rather than from a separate
 * endpoint that could disagree with the rows underneath it. One row is
 * requested because only the total is wanted.
 *
 * Three queries, but the one matching the current segment is the page the
 * table already asked for, so React Query serves it from cache rather than
 * issuing it again.
 */
export function useClubCounts(
  filters: Omit<ClubListQuery, "offset" | "limit" | "isVerified">
) {
  const base = { ...filters, offset: 0, limit: 1 };
  const all = useClubs(base);
  const verified = useClubs({ ...base, isVerified: true });
  const awaiting = useClubs({ ...base, isVerified: false });

  return {
    all: all.data?.total ?? null,
    verified: verified.data?.total ?? null,
    awaiting: awaiting.data?.total ?? null,
  };
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

export function useCreateClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createClub,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.clubs.all });
      toast.success("Club created");
    },
    onError: (error) => toast.error(error.message || "Could not create the club"),
  });
}
