"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "@moa/ui";
import { qk } from "@moa/api";

import {
  fetchUser,
  fetchUserBadges,
  fetchUsers,
  fetchUserClubs,
  fetchUserEvents,
  setUserActive,
  updateUser,
  deleteUser,
  setAdminRole,
  type UserEventQuery,
  type UserListQuery,
  type UserSubListQuery,
} from "./api";

export function useUsers(query: UserListQuery) {
  return useQuery({
    queryKey: qk.users.list(query),
    queryFn: () => fetchUsers(query),
    // Keeps the previous page on screen while the next one loads, so paging
    // and searching do not blank the table on every keystroke.
    placeholderData: keepPreviousData,
  });
}

export function useUser(userId: number) {
  return useQuery({
    queryKey: qk.users.detail(userId),
    queryFn: () => fetchUser(userId),
  });
}

export function useUserClubs(userId: number, query: UserSubListQuery) {
  return useQuery({
    queryKey: [...qk.users.detail(userId), "clubs", query],
    queryFn: () => fetchUserClubs(userId, query),
    placeholderData: keepPreviousData,
  });
}

export function useUserEvents(userId: number, query: UserEventQuery) {
  return useQuery({
    queryKey: [...qk.users.detail(userId), "events", query],
    queryFn: () => fetchUserEvents(userId, query),
    placeholderData: keepPreviousData,
  });
}

export function useUserBadges(userId: number) {
  return useQuery({
    queryKey: [...qk.users.detail(userId), "badges"],
    queryFn: () => fetchUserBadges(userId),
  });
}

export function useSetUserActive(userId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ isActive, reason }: { isActive: boolean; reason?: string }) =>
      setUserActive(userId, isActive, reason),
    onSuccess: async (_data, variables) => {
      toast.success(variables.isActive ? "Account reinstated" : "Account suspended");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.users.all }),
        // The change is written to the audit log.
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateUser(userId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { full_name: string; email: string; phone?: string }) =>
      updateUser(userId, input),
    onSuccess: async () => {
      toast.success("Account updated");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.users.all }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: async () => {
      toast.success("Account deleted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.users.all }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSetAdminRole(userId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: string) => setAdminRole(userId, role),
    onSuccess: async () => {
      toast.success("Role updated");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.users.all }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
