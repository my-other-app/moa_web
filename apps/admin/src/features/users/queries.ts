"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import {
  fetchUser,
  fetchUserBadges,
  fetchUsers,
  fetchUserClubs,
  fetchUserEvents,
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
