"use client";

import * as React from "react";
import type { Paginated } from "@moa/api";

import type { useListParams } from "./use-list-params";

/**
 * Adapts a plain array into the Paginated shape ResourceList expects, applying
 * search and paging in the browser.
 *
 * Several admin endpoints (/orgs/list, /badges/admin, /user/avatar/list) return
 * the full collection with no search or pagination parameters. Rather than give
 * those pages a second, divergent list implementation, they reuse the same
 * scaffold with filtering done here. These collections are small by nature --
 * organisations and badge definitions number in the tens -- so this is cheap;
 * if one ever grows, the fix is server-side paging, not a different component.
 */
export function useLocalPage<T>(
  items: T[] | undefined,
  params: ReturnType<typeof useListParams>,
  matches: (item: T, query: string) => boolean
): Paginated<T> | undefined {
  return React.useMemo(() => {
    if (!items) return undefined;

    const query = params.search.trim().toLowerCase();
    const filtered = query ? items.filter((item) => matches(item, query)) : items;
    const start = (params.page - 1) * params.pageSize;

    return {
      limit: params.pageSize,
      offset: start,
      total: filtered.length,
      next: null,
      items: filtered.slice(start, start + params.pageSize),
    };
  }, [items, params.search, params.page, params.pageSize, matches]);
}
