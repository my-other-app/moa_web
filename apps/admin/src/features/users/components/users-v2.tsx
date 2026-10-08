"use client";

import * as React from "react";
import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileSpreadsheetIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";
import { formatNumber, initials, useListParams } from "@moa/app-kit";
import { InlineAlert, Skeleton, cn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import { ViewChips, type ViewChip } from "@/components/view-chips";
import { ProviderIcon, providerLabel } from "@/components/provider-icon";
import { useExportUsers, useUsers } from "../queries";
import type { UserFilters } from "../api";
import type { AdminUser } from "../schemas";
import { UserDrawer } from "./user-drawer";

/**
 * The v2 Users screen.
 *
 * Everything that narrows the list lives in the URL, so a filtered view is a
 * link an admin can paste to a colleague, the back button steps through
 * filter changes, and a saved view is nothing more than a saved query string.
 *
 * The row opens a drawer rather than navigating. Checking one account
 * mid-triage should not cost the filters, the page and the scroll position;
 * `/users/[id]` still exists for a link that has to survive a reload.
 */
const PAGE_SIZE = 25;

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "app_user", label: "App user" },
  { value: "club", label: "Club" },
  { value: "admin", label: "Admin" },
  { value: "guest", label: "Guest" },
] as const;

const PROVIDER_OPTIONS = [
  { value: "", label: "Any sign-in" },
  { value: "google", label: "Google" },
  { value: "apple", label: "Apple" },
  { value: "email", label: "Email" },
] as const;

const SORT_OPTIONS = [
  { value: "joined", label: "Sort: joined" },
  { value: "name", label: "Sort: name" },
  { value: "email", label: "Sort: email" },
  { value: "username", label: "Sort: username" },
] as const;

const BUILT_IN_VIEWS: ReadonlyArray<ViewChip> = [
  { id: "all", label: "All users", query: "" },
  { id: "suspended", label: "Suspended", query: "active=false" },
  { id: "apple", label: "Apple sign-ins", query: "provider=apple" },
  { id: "clubs", label: "Club accounts", query: "user_type=club" },
];

const TYPE_LABELS: Record<string, string> = {
  app_user: "App user",
  club: "Club",
  admin: "Admin",
  guest: "Guest",
};

/*
 * The grid is declared once and used by the header and every row, because the
 * two must not diverge -- a header on its own template drifts a few pixels
 * out of line with the cells beneath it and nothing in the type system
 * notices.
 *
 * Six columns from `md` up, exactly as drawn. Below that it collapses to two.
 * The design puts all six in a horizontal scroller, which on a phone leaves
 * Status -- the column you are scanning for during triage -- about 400px off
 * the right edge, behind a scroll gesture nothing advertises. The four middle
 * columns are all repeated in the drawer a tap away, so they are the ones
 * that give way.
 */
const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-3 md:grid-cols-[minmax(200px,1.6fr)_minmax(180px,1.4fr)_100px_90px_110px_110px]";

/** The four columns that fold away on a phone. */
const WIDE_ONLY = "hidden md:block";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  support: "Support",
  viewer: "Viewer",
};

/**
 * The Status cell.
 *
 * Suspension first: a suspended admin is a suspended account, and that is the
 * fact worth reading.
 *
 * For an active admin the design shows "Admin" in the accent tag. This shows
 * the role instead -- the Type column two cells away already says "Admin", so
 * the tag was spending the row's only accent on a word the row had already
 * said. Same tag, same place, same emphasis; a more specific word.
 */
function statusOf(user: AdminUser): { label: string; className: string } {
  if (!user.is_active) return { label: "Suspended", className: "tag tag-outline" };
  if (user.admin_role) {
    return {
      label: ROLE_LABELS[user.admin_role] ?? "Admin",
      className: "tag tag-accent",
    };
  }
  return { label: "Active", className: "tag tag-neutral" };
}

/** Short date: the column is 110px and a year is worth more than a weekday. */
function joinedText(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function RowsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className={cn(GRID, "rule-fade items-center px-1.5 py-2.5")}>
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-[30px] shrink-0 rounded-full" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          {/* The same four that fold away in a real row, or the skeleton
              wraps onto three lines where the row it stands in for has one. */}
          <Skeleton className={cn(WIDE_ONLY, "h-3.5 w-40")} />
          <Skeleton className={cn(WIDE_ONLY, "h-3.5 w-16")} />
          <Skeleton className={cn(WIDE_ONLY, "h-3.5 w-14")} />
          <Skeleton className={cn(WIDE_ONLY, "h-3.5 w-20")} />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function UsersV2() {
  const params = useListParams({ pageSize: PAGE_SIZE });
  const canExport = useCan("export_data");
  const exportUsers = useExportUsers();

  const [selected, setSelected] = React.useState<AdminUser | null>(null);

  const search = params.search;
  const userType = params.param("user_type");
  const provider = params.param("provider");
  const sort = params.param("sort") ?? "joined";
  const order = params.param("order") ?? "desc";
  // "active" rather than "is_active" in the URL: it is a hand-written link as
  // often as a generated one.
  const activeParam = params.param("active");

  const filters: UserFilters = {
    search: search || undefined,
    userType,
    provider,
    sort,
    order,
    isActive: activeParam === undefined ? undefined : activeParam !== "false",
  };

  const { data, isPending, isError, error, isPlaceholderData } = useUsers({
    ...filters,
    offset: params.offset,
    // params.pageSize, not the constant: the URL may carry ?size=, and a
    // limit that disagreed with the offset it was derived from would skip or
    // repeat rows between pages.
    limit: params.pageSize,
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / params.pageSize));
  const firstOnPage = params.offset + 1;
  const lastOnPage = Math.min(total, params.offset + rows.length);

  const anyFilter = Boolean(search || userType || provider || activeParam !== undefined);

  /*
   * An unfiltered total needs its own request, so it is only asked for when
   * the empty state would use it -- "there are N in total, the filters are
   * hiding them" is the sentence that distinguishes a wrong filter from an
   * empty platform, and it is worth one query at exactly the moment it is
   * read.
   */
  const showEmpty = !isPending && !isError && rows.length === 0;
  const unfiltered = useUsers(
    { offset: 0, limit: 1 },
    { enabled: showEmpty && anyFilter }
  );

  function describeCurrent(): string {
    const parts = [
      userType ? TYPE_LABELS[userType] : null,
      provider ? providerLabel(provider) : null,
      activeParam === "false" ? "Suspended" : null,
      search ? `“${search}”` : null,
    ].filter(Boolean);
    return parts.join(" · ");
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-end gap-3.5">
        <div className="flex-1 basis-[300px]">
          <h2 className="m-0 text-[32px] leading-[1.12] tracking-[-0.015em]">Users</h2>
          <span className="text-[13px] text-[var(--color-neutral-500)]">
            {isPending
              ? "Loading…"
              : anyFilter
                ? `${formatNumber(total)} match`
                : `${formatNumber(total)} people · app users, club logins, admins and guests`}
          </span>
        </div>

        {canExport ? (
          <button
            type="button"
            className="btn btn-secondary whitespace-nowrap"
            disabled={exportUsers.isPending || total === 0}
            onClick={() => exportUsers.mutate(filters)}
          >
            {exportUsers.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <FileSpreadsheetIcon className="size-4" />
            )}
            {exportUsers.isPending
              ? "Preparing…"
              : `Export ${formatNumber(total)} as CSV`}
          </button>
        ) : null}
      </header>

      <ViewChips
        storageKey="users"
        builtIn={BUILT_IN_VIEWS}
        describeCurrent={describeCurrent}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-[320px] flex-1 basis-[240px]">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-[11px] size-4 -translate-y-1/2 text-[var(--color-neutral-500)]" />
          <input
            className="input pl-8"
            type="search"
            aria-label="Search users"
            placeholder="Name, email or username"
            value={params.searchInput}
            onChange={(event) => params.setSearchInput(event.target.value)}
            // Committed on settle rather than per keystroke: writing the URL
            // on every character pushes a history entry per character.
            onBlur={(event) => params.commitSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") params.commitSearch(params.searchInput);
            }}
          />
        </div>

        <select
          className="input w-[150px]"
          aria-label="User type"
          value={userType ?? ""}
          onChange={(event) => params.setParam("user_type", event.target.value || undefined)}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className="input w-[140px]"
          aria-label="Sign-in provider"
          value={provider ?? ""}
          onChange={(event) => params.setParam("provider", event.target.value || undefined)}
        >
          {PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className="input w-[150px]"
          aria-label="Sort by"
          value={sort}
          onChange={(event) => params.setParam("sort", event.target.value)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn btn-icon btn-secondary"
          title={order === "asc" ? "Ascending" : "Descending"}
          aria-label={`Sort ${order === "asc" ? "ascending" : "descending"}`}
          onClick={() => params.setParam("order", order === "asc" ? "desc" : "asc")}
        >
          {order === "asc" ? (
            <ArrowUpNarrowWideIcon className="size-4" />
          ) : (
            <ArrowDownWideNarrowIcon className="size-4" />
          )}
        </button>
      </div>

      {isError ? (
        <InlineAlert tone="destructive" title="Could not load the list">
          {error instanceof Error ? error.message : "Try again in a moment."}
        </InlineAlert>
      ) : null}

      {!isError && (isPending || rows.length > 0) ? (
        <>
          <div className="overflow-x-auto">
            <div
              className={cn(
                "flex flex-col md:min-w-[820px]",
                // The previous page stays legible while the next one loads,
                // dimmed so it does not read as current.
                isPlaceholderData && "opacity-60 transition-opacity"
              )}
            >
              <div
                className={cn(
                  GRID,
                  "micro px-1.5 py-2.5",
                  "bg-[linear-gradient(to_right,transparent,var(--color-divider)_48px,var(--color-divider)_calc(100%-48px),transparent)] bg-[length:100%_1px] bg-bottom bg-no-repeat"
                )}
              >
                <span>User</span>
                <span className={WIDE_ONLY}>Email</span>
                <span className={WIDE_ONLY}>Type</span>
                <span className={WIDE_ONLY}>Sign-in</span>
                <span className={WIDE_ONLY}>Joined</span>
                <span className="text-right">Status</span>
              </div>

              {isPending ? (
                <RowsSkeleton />
              ) : (
                rows.map((user) => {
                  const status = statusOf(user);
                  const name = user.full_name || user.username;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelected(user)}
                      className={cn(
                        GRID,
                        "rule-fade cursor-pointer items-center px-1.5 py-2.5 text-left text-[13.5px]",
                        "hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)]"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            "grid size-[30px] shrink-0 place-items-center rounded-full text-[11px]",
                            user.user_type === "club"
                              ? "bg-[var(--color-accent-800)] text-[var(--color-accent-100)]"
                              : "bg-[var(--color-neutral-800)] text-[var(--color-neutral-200)]"
                          )}
                        >
                          {initials(name)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{name}</span>
                          <span className="flex items-center gap-1.5 truncate text-[11.5px] text-[var(--color-neutral-500)]">
                            <span className="truncate">@{user.username}</span>
                            {/* What the folded columns would have said, on the
                                line that is still visible. */}
                            <span className="flex items-center gap-1 whitespace-nowrap md:hidden">
                              · {TYPE_LABELS[user.user_type] ?? user.user_type}
                              <ProviderIcon provider={user.provider} className="size-3" />
                            </span>
                          </span>
                        </span>
                      </span>

                      <span className={cn(WIDE_ONLY, "truncate text-[var(--color-neutral-300)]")}>
                        {user.email || "—"}
                      </span>

                      <span className={cn(WIDE_ONLY, "text-[12.5px] text-[var(--color-neutral-300)]")}>
                        {TYPE_LABELS[user.user_type] ?? user.user_type}
                      </span>

                      <span
                        className={cn(
                          WIDE_ONLY,
                          "items-center gap-1.5 text-[12.5px] text-[var(--color-neutral-400)] md:flex"
                        )}
                      >
                        <ProviderIcon provider={user.provider} />
                        <span className="truncate">{providerLabel(user.provider)}</span>
                      </span>

                      <span className={cn(WIDE_ONLY, "text-[12.5px] text-[var(--color-neutral-400)]")}>
                        {joinedText(user.created_at)}
                      </span>

                      <span className="flex justify-end">
                        <span className={status.className}>{status.label}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-[12.5px] text-[var(--color-neutral-400)]">
              {isPending
                ? " "
                : `Page ${params.page} of ${pages} · ${formatNumber(firstOnPage)}–${formatNumber(lastOnPage)} of ${formatNumber(total)}`}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="btn btn-secondary whitespace-nowrap"
                disabled={params.page <= 1}
                onClick={() => params.setPage(params.page - 1)}
              >
                <ChevronLeftIcon className="size-4" />
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary whitespace-nowrap"
                disabled={params.page >= pages}
                onClick={() => params.setPage(params.page + 1)}
              >
                Next
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
          </div>
        </>
      ) : null}

      {showEmpty ? (
        <div className="flex flex-col items-start gap-2 py-10">
          <span className="text-[16px]">
            {anyFilter ? "No users match these filters" : "No users yet"}
          </span>
          <span className="text-[13px] text-[var(--color-neutral-400)]">
            {anyFilter
              ? unfiltered.data
                ? `There are ${formatNumber(unfiltered.data.total ?? 0)} users in total — the filters are hiding them.`
                : "Clearing the filters will show the rest."
              : "People who sign up through the app will appear here."}
          </span>
          {anyFilter ? (
            <button
              type="button"
              className="btn btn-secondary mt-1.5 whitespace-nowrap"
              // One write, including "q": two calls would be two history
              // entries for one click, and Back would then half-restore the
              // filters.
              onClick={() =>
                params.clearParams([
                  "q",
                  "user_type",
                  "provider",
                  "active",
                  "sort",
                  "order",
                ])
              }
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      <UserDrawer
        row={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
