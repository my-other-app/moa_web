"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { nullIfRouteMissing } from "@moa/api";

import { fetchContacts } from "./api";
import type { ContactFilters } from "./schemas";

const KEY = ["contacts"] as const;
/** How often a backend without the contact book is asked again, so the page turns up once it has one. */
const NO_BOOK_EVERY = 15 * 60_000;

/**
 * A page of the contact book. `null`: a backend from before it (the route
 * answers a bare 404) -- the page and its menu item stay hidden.
 */
export function useContacts(filters: ContactFilters, page: number, pageSize: number, enabled = true) {
  return useQuery({
    queryKey: [...KEY, filters, page, pageSize],
    queryFn: () => nullIfRouteMissing(() => fetchContacts(filters, page, pageSize)),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
    enabled,
  });
}

/**
 * Whether the API has the contact book: the first page with no filters,
 * shared with the page's own first read. Undefined while it is asked.
 */
export function useContactsOnServer(enabled = true): boolean | undefined {
  const q = useQuery({
    queryKey: [...KEY, {}, 1, 1],
    queryFn: () => nullIfRouteMissing(() => fetchContacts({}, 1, 1)),
    staleTime: 5 * 60_000,
    refetchInterval: (query) => (query.state.data === null ? NO_BOOK_EVERY : false),
    retry: false,
    enabled,
  });
  if (q.data === null) return false;
  if (q.data) return true;
  // Refused (a role without it) or failing: the menu follows the role, the page says what went wrong.
  if (q.isError) return true;
  return undefined;
}
