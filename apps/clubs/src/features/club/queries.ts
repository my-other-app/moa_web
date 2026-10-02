"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import {
  changePassword,
  fetchInterestCategories,
  fetchMyClub,
  fetchOrganizations,
  updateClubLogo,
  updateMyClub,
} from "./api";
import type { ChangePasswordForm, ClubProfileForm } from "./schemas";

export function useMyClub() {
  return useQuery({
    queryKey: qk.clubs.self(),
    queryFn: fetchMyClub,
    staleTime: staleTimes.analytics,
  });
}

/**
 * Interests and organizations are reference data -- they change when an admin
 * edits them, which is rare -- so they sit in the longest cache tier and are
 * shared by every form that needs them.
 */
export function useInterestCategories() {
  return useQuery({
    queryKey: qk.interests.all,
    queryFn: fetchInterestCategories,
    staleTime: staleTimes.reference,
  });
}

export function useOrganizations() {
  return useQuery({
    queryKey: qk.orgs.list({}),
    queryFn: fetchOrganizations,
    staleTime: staleTimes.reference,
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

/**
 * Changing the password bumps `token_version` server-side, and the auth
 * dependency rejects any token carrying an older one. The session this request
 * was made with is therefore dead the moment it succeeds, so the caller has to
 * send the user back to sign in rather than leave them on a page where every
 * subsequent request 401s.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordForm) => changePassword(input),
    onError: (error: Error) => toast.error(error.message),
  });
}
