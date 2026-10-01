"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import type { SessionUser } from "@moa/auth";

import { fetchSession, login, logout } from "./api";
import type { LoginInput } from "./schemas";

export function useSession(initialData?: SessionUser) {
  return useQuery({
    queryKey: qk.session,
    queryFn: fetchSession,
    initialData,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: async () => {
      // The cookie is now set; pull the profile so the shell can render the
      // right identity immediately rather than after a navigation.
      await queryClient.invalidateQueries({ queryKey: qk.session });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Clear everything, not just the session: cached lists belong to the
      // user who just signed out and must not be visible to the next one.
      queryClient.clear();
    },
  });
}
