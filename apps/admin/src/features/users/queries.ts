"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { fetchUsers, type UserListQuery } from "./api";

export function useUsers(query: UserListQuery) {
  return useQuery({
    queryKey: qk.users.list(query),
    queryFn: () => fetchUsers(query),
    // Keeps the previous page on screen while the next one loads, so paging
    // and searching do not blank the table on every keystroke.
    placeholderData: keepPreviousData,
  });
}
