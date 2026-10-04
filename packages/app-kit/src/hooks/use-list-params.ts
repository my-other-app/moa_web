"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "@moa/api";

export interface ListParams {
  search: string;
  page: number;
  pageSize: number;
  /** Arbitrary filter and sort keys, kept in the URL beside the rest. */
  params: Record<string, string | undefined>;
}

/**
 * List state (search term, page, page size) held in the URL.
 *
 * The URL is the source of truth so an admin can bookmark or share "page 3 of
 * clubs matching 'cet'", and so the browser back button steps through filter
 * changes instead of leaving the dashboard entirely. Keeping it in component
 * state would lose all of that.
 *
 * The visible input stays local state and is committed to the URL only once
 * typing settles; writing on every keystroke would push a history entry per
 * character.
 */
export function useListParams(defaults?: Partial<ListParams>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get("q") ?? defaults?.search ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? defaults?.page ?? 1) || 1);
  const pageSize =
    Number(searchParams.get("size") ?? defaults?.pageSize ?? DEFAULT_PAGE_SIZE) ||
    DEFAULT_PAGE_SIZE;

  const [searchInput, setSearchInput] = React.useState(search);

  // Keep the box in step when navigation changes the URL (back button, a reset
  // link), but not while the user is mid-type -- that would fight their input.
  React.useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const write = React.useCallback(
    (next: Partial<ListParams>, { replace = false }: { replace?: boolean } = {}) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.search !== undefined) {
        if (next.search) params.set("q", next.search);
        else params.delete("q");
        // Any new search starts at page 1; staying on page 4 of a narrower
        // result set shows an empty table and looks like a bug.
        params.delete("page");
      }
      if (next.page !== undefined) {
        if (next.page > 1) params.set("page", String(next.page));
        else params.delete("page");
      }
      if (next.pageSize !== undefined) {
        if (next.pageSize !== DEFAULT_PAGE_SIZE) params.set("size", String(next.pageSize));
        else params.delete("size");
        params.delete("page");
      }

      // Filters and sort keys share the same query string. They are written
      // through the same path so every change resets the page for the same
      // reason a new search does: page 4 of a narrower result set is empty
      // and reads as a bug.
      for (const [key, value] of Object.entries(next.params ?? {})) {
        if (value) params.set(key, value);
        else params.delete(key);
        params.delete("page");
      }

      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      // Typing replaces history; explicit paging pushes it.
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  /**
   * Commits a settled search term to the URL. Debouncing lives in
   * <SearchInput>, which already provides onDebouncedChange -- duplicating it
   * here would mean two timers and a laggier box.
   */
  const commitSearch = React.useCallback(
    (value: string) => {
      if (value === search) return;
      write({ search: value }, { replace: true });
    },
    [search, write]
  );

  return {
    search,
    page,
    pageSize,
    searchInput,
    setSearchInput,
    commitSearch,
    setPage: (p: number) => write({ page: p }),
    setPageSize: (s: number) => write({ pageSize: s }),
    reset: () => write({ search: "", page: 1 }),

    /** Reads one filter or sort key from the URL. */
    param: (key: string) => searchParams.get(key) ?? undefined,
    /** Sets one; an empty value removes it, which is how "All" is expressed. */
    setParam: (key: string, value: string | undefined) =>
      write({ params: { [key]: value } }),
    /** How many of `keys` are currently set, for the "Clear" affordance. */
    activeCount: (keys: string[]) =>
      keys.filter((key) => searchParams.get(key)).length,
    clearParams: (keys: string[]) =>
      write({ params: Object.fromEntries(keys.map((key) => [key, undefined])) }),
    /** Offset for the API, derived from the 1-based page in the URL. */
    offset: (page - 1) * pageSize,
  };
}
