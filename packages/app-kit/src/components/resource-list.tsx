"use client";

import * as React from "react";
import { SearchXIcon } from "lucide-react";
import { type Paginated, pageCount } from "@moa/api";
import {
  Card,
  DataTable,
  EmptyState,
  Pagination,
  SearchInput,
  Skeleton,
  type DataTableColumn,
} from "@moa/ui";
import { stagger } from "@moa/ui/motion";

import { useListParams } from "../hooks/use-list-params";

export interface ResourceListProps<T> {
  /** Result of a paginated query. */
  page: Paginated<T> | undefined;
  isPending: boolean;
  isError: boolean;
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => React.Key;
  params: ReturnType<typeof useListParams>;
  searchPlaceholder?: string;
  /** Shown when the resource genuinely has no rows (no search applied). */
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** Extra controls rendered beside the search box. */
  toolbar?: React.ReactNode;
}

/**
 * One list scaffold for every resource page: search, pagination, and the
 * loading / empty / error states.
 *
 * This exists because the dashboard it replaces repeated the same ~200 lines
 * on each of its list pages -- including, three times over, the same
 * stale-closure debounce bug. Fixing it in one place fixes it everywhere.
 */
export function ResourceList<T>({
  page,
  isPending,
  isError,
  columns,
  rowKey,
  params,
  searchPlaceholder = "Search…",
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  toolbar,
}: ResourceListProps<T>) {
  const total = page?.total ?? null;
  const pages = pageCount(total, params.pageSize) ?? 1;
  const isSearching = params.search.length > 0;
  // The backend fetches limit+1 to detect a next page, so trim the extra row
  // rather than rendering a phantom entry at the bottom of every page.
  const rows = page?.items.slice(0, params.pageSize);
  const isEmpty = !isPending && !isError && (rows?.length ?? 0) === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={params.searchInput}
          onChange={params.setSearchInput}
          onDebouncedChange={params.commitSearch}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          containerClassName="sm:max-w-xs"
        />
        {toolbar}
        <div className="flex-1" />
        {total !== null ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {total.toLocaleString("en-IN")} total
          </p>
        ) : null}
      </div>

      {isPending ? (
        <Card className="p-4">
          <div className="space-y-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" style={stagger(i, 60, 240)} />
            ))}
          </div>
        </Card>
      ) : isEmpty ? (
        <Card className="p-0">
          <EmptyState
            icon={<SearchXIcon />}
            title={isSearching ? "No matches" : emptyTitle}
            description={
              isSearching
                ? `Nothing matched “${params.search}”. Try a different term.`
                : emptyDescription
            }
            action={
              isSearching ? (
                <button
                  type="button"
                  onClick={params.reset}
                  className="text-primary text-sm underline-offset-4 hover:underline"
                >
                  Clear search
                </button>
              ) : (
                emptyAction
              )
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <DataTable
            columns={columns}
            data={rows}
            rowKey={rowKey}
            isError={isError}
          />
        </Card>
      )}

      {!isPending && !isEmpty && pages > 1 ? (
        <Pagination
          page={params.page}
          pageCount={pages}
          onPageChange={params.setPage}
          pageSize={params.pageSize}
          onPageSizeChange={params.setPageSize}
        />
      ) : null}
    </div>
  );
}
