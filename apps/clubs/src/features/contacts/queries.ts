"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchContacts } from "./api";
import type { ContactsQuery } from "./schemas";

export function useContacts(q: ContactsQuery) {
  return useQuery({ queryKey: ["contacts", q], queryFn: () => fetchContacts(q), placeholderData: keepPreviousData, staleTime: 15_000 });
}
