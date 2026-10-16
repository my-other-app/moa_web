"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckIcon,
  CheckSquareIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  SquareIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { formatNumber, initials, useListParams } from "@moa/app-kit";
import { InlineAlert, Skeleton, cn, toast } from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import { useOrgs } from "@/features/orgs";
import { approveClub } from "../api";
import { useClubCounts, useClubs } from "../queries";
import type { AdminClub } from "../schemas";
import { CreateClubWizard } from "./create-club-wizard";

/**
 * The v2 Clubs screen.
 *
 * The list exists mostly to find the clubs waiting on a decision, so the
 * verification segment is the first control and carries its own counts --
 * "Awaiting 4" is the number an admin opens this page to see.
 *
 * Bulk approve is the other reason: approving a term's worth of clubs one
 * dialog at a time was the single most repetitive thing in the old
 * dashboard.
 */
const PAGE_SIZE = 25;

const SORT_OPTIONS = [
  { value: "created", label: "Sort: created" },
  { value: "name", label: "Sort: name" },
  { value: "followers", label: "Sort: followers" },
] as const;

type Segment = "all" | "verified" | "awaiting";

const GRID =
  "grid grid-cols-[32px_minmax(0,1fr)_auto] gap-3 md:grid-cols-[32px_minmax(220px,2fr)_minmax(150px,1.2fr)_90px_80px_110px_120px]";

const WIDE_ONLY = "hidden md:block";

/**
 * Narrow a selection to the clubs actually on screen and actually approvable.
 *
 * Derived on every render rather than pruned when the filters change: a
 * selection that outlives its rows is the worst kind of bulk action, because
 * the count in the bar stays right while the clubs behind it quietly become
 * something else. Switching to the Verified segment with an unverified club
 * ticked would otherwise still read "Approve 1".
 *
 * Exported for its own test: the list filters live in the URL, and the test
 * environment stubs `useSearchParams` as a constant, so the rendered screen
 * cannot be driven through a filter change.
 */
export function selectionWithin(
  rows: ReadonlyArray<Pick<AdminClub, "id" | "is_verified">>,
  selected: ReadonlyArray<number>
): number[] {
  const approvable = new Set(rows.filter((club) => !club.is_verified).map((c) => c.id));
  return selected.filter((id) => approvable.has(id));
}

function createdText(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function RowsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={cn(GRID, "rule-fade items-center px-1.5 py-2.5")}>
          <span />
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8 shrink-0 rounded-[var(--radius-md)]" />
            <Skeleton className="h-3.5 w-36" />
          </div>
          <Skeleton className={cn(WIDE_ONLY, "h-3.5 w-28")} />
          <Skeleton className={cn(WIDE_ONLY, "ml-auto h-3.5 w-10")} />
          <Skeleton className={cn(WIDE_ONLY, "ml-auto h-3.5 w-6")} />
          <Skeleton className={cn(WIDE_ONLY, "h-3.5 w-20")} />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ClubsV2() {
  const params = useListParams({ pageSize: PAGE_SIZE });
  const queryClient = useQueryClient();
  const canModerate = useCan("moderate");
  const canCreate = useCan("manage_content");

  const [selected, setSelected] = React.useState<number[]>([]);
  const [approving, setApproving] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  const search = params.search;
  const orgParam = params.param("org");
  const sort = params.param("sort") ?? "created";
  const segment = (params.param("segment") ?? "all") as Segment;

  const filters = {
    search: search || undefined,
    orgId: orgParam ? Number(orgParam) : undefined,
    sort,
    order: sort === "name" ? "asc" : "desc",
  };

  const isVerified =
    segment === "verified" ? true : segment === "awaiting" ? false : undefined;

  const { data, isPending, isError, error, isPlaceholderData } = useClubs({
    ...filters,
    isVerified,
    offset: params.offset,
    limit: params.pageSize,
  });

  const counts = useClubCounts(filters);
  const orgs = useOrgs();

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / params.pageSize));

  const effectiveSelection = selectionWithin(rows, selected);

  function toggle(clubId: number) {
    setSelected((current) =>
      current.includes(clubId)
        ? current.filter((id) => id !== clubId)
        : [...current, clubId]
    );
  }

  /**
   * Approve each selected club in turn.
   *
   * Sequential, not Promise.all: this is a handful of writes against a box
   * that is CPU-credit throttled, and firing twenty at once is how you find
   * that out. Failures are counted rather than thrown, because stopping
   * halfway through leaves the admin guessing which ones went through.
   */
  async function bulkApprove() {
    setApproving(true);
    const failures: string[] = [];
    let done = 0;

    for (const id of effectiveSelection) {
      try {
        await approveClub(id);
        done += 1;
      } catch {
        const club = rows.find((c) => c.id === id);
        failures.push(club?.name ?? `#${id}`);
      }
    }

    setApproving(false);
    setSelected([]);
    // One invalidation at the end rather than one per club: the segment
    // counts are club-list queries too, so refetching after each approval
    // would redraw the whole screen twenty times.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.clubs.all }),
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
    ]);

    if (failures.length === 0) {
      toast.success(`${done} ${done === 1 ? "club" : "clubs"} approved`);
    } else {
      toast.error(
        `${done} approved, ${failures.length} failed: ${failures.slice(0, 3).join(", ")}${
          failures.length > 3 ? "…" : ""
        }`
      );
    }
  }

  const segments: ReadonlyArray<{ key: Segment; label: string; count: number | null }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "verified", label: "Verified", count: counts.verified },
    { key: "awaiting", label: "Awaiting", count: counts.awaiting },
  ];

  const anyFilter = Boolean(search || orgParam || segment !== "all");

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-end gap-3.5">
        <div className="flex-1 basis-[300px]">
          <h2 className="m-0 text-[32px] leading-[1.12] tracking-[-0.015em]">Clubs</h2>
          <span className="text-[13px] text-ink-3">
            {counts.all === null
              ? "Loading…"
              : `${formatNumber(counts.all)} clubs · ${formatNumber(counts.verified ?? 0)} verified · ${formatNumber(counts.awaiting ?? 0)} awaiting approval`}
          </span>
        </div>

        {canCreate ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon className="size-4" />
            Create club
          </button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-[300px] flex-1 basis-[220px]">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-[11px] size-4 -translate-y-1/2 text-ink-3" />
          <input
            className="input pl-8"
            type="search"
            aria-label="Search clubs"
            placeholder="Search clubs"
            value={params.searchInput}
            onChange={(event) => params.setSearchInput(event.target.value)}
            onBlur={(event) => params.commitSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") params.commitSearch(params.searchInput);
            }}
          />
        </div>

        <div
          role="group"
          aria-label="Verification"
          className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-line"
        >
          {segments.map((option, index) => {
            const active = segment === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  params.setParam("segment", option.key === "all" ? undefined : option.key)
                }
                className={cn(
                  "flex items-center gap-1.5 px-3 py-[7px] text-[13px] whitespace-nowrap transition-colors",
                  index > 0 && "border-l border-line",
                  active
                    ? "bg-brand-soft text-brand"
                    : "text-ink-2 hover:bg-sunken"
                )}
              >
                {option.label}
                <span className="text-[11px] text-ink-3">
                  {option.count === null ? "" : formatNumber(option.count)}
                </span>
              </button>
            );
          })}
        </div>

        <select
          className="input w-[200px]"
          aria-label="Organisation"
          value={orgParam ?? ""}
          onChange={(event) => params.setParam("org", event.target.value || undefined)}
        >
          <option value="">All organisations</option>
          {(orgs.data ?? []).map((org) => (
            <option key={org.id} value={String(org.id)}>
              {org.name}
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
      </div>

      {effectiveSelection.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] bg-brand-soft px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--brand-line)]">
          <span className="flex-1 text-[13.5px]">
            {effectiveSelection.length} unverified club
            {effectiveSelection.length > 1 ? "s" : ""} selected · verified clubs cannot be
            selected
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={approving}
            onClick={() => setSelected([])}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={approving}
            onClick={() => void bulkApprove()}
          >
            {approving ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CheckIcon className="size-4" />
            )}
            {approving ? "Approving…" : `Approve ${effectiveSelection.length}`}
          </button>
        </div>
      ) : null}

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
                isPlaceholderData && "opacity-60 transition-opacity"
              )}
            >
              <div
                className={cn(
                  GRID,
                  "micro px-1.5 py-2.5",
                  "bg-[linear-gradient(to_right,transparent,var(--line)_48px,var(--line)_calc(100%-48px),transparent)] bg-[length:100%_1px] bg-bottom bg-no-repeat"
                )}
              >
                <span />
                <span>Club</span>
                <span className={WIDE_ONLY}>Organisation</span>
                <span className={cn(WIDE_ONLY, "text-right")}>Followers</span>
                <span className={cn(WIDE_ONLY, "text-right")}>Events</span>
                <span className={WIDE_ONLY}>Created</span>
                <span className="text-right">Status</span>
              </div>

              {isPending ? (
                <RowsSkeleton />
              ) : (
                rows.map((club: AdminClub) => {
                  const selectable = !club.is_verified && canModerate;
                  const checked = effectiveSelection.includes(club.id);
                  return (
                    <div
                      key={club.id}
                      className={cn(GRID, "rule-fade items-center px-1.5 py-2.5 text-[13.5px]")}
                    >
                      <span>
                        {selectable ? (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            aria-label={`Select ${club.name} for bulk approval`}
                            onClick={() => toggle(club.id)}
                            className={cn(
                              "cursor-pointer",
                              checked
                                ? "text-brand"
                                : "text-ink-3"
                            )}
                          >
                            {checked ? (
                              <CheckSquareIcon className="size-[19px]" />
                            ) : (
                              <SquareIcon className="size-[19px]" />
                            )}
                          </button>
                        ) : null}
                      </span>

                      <Link
                        href={`/clubs/${club.id}`}
                        className="flex min-w-0 items-center gap-2.5 text-left"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand-soft text-[11px] text-brand">
                          {initials(club.name)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{club.name}</span>
                          <span className="truncate text-[11.5px] text-ink-3">
                            {club.owner_email || club.contact_email || "—"}
                          </span>
                        </span>
                      </Link>

                      <span
                        className={cn(
                          WIDE_ONLY,
                          "truncate text-[12.5px] text-ink-2"
                        )}
                      >
                        {club.org?.name ?? "—"}
                      </span>

                      <span className={cn(WIDE_ONLY, "text-right")}>
                        {formatNumber(club.followers_count)}
                      </span>

                      <span className={cn(WIDE_ONLY, "text-right")}>
                        {formatNumber(club.events_count)}
                      </span>

                      <span
                        className={cn(WIDE_ONLY, "text-[12.5px] text-ink-2")}
                      >
                        {createdText(club.created_at)}
                      </span>

                      <span className="flex justify-end">
                        <span className={club.is_verified ? "tag tag-neutral" : "tag tag-outline"}>
                          {club.is_verified ? "Verified" : "Awaiting"}
                        </span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-[12.5px] text-ink-2">
              {isPending
                ? " "
                : `Page ${params.page} of ${pages} · ${formatNumber(total)} ${total === 1 ? "club" : "clubs"}`}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={params.page <= 1}
                onClick={() => params.setPage(params.page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={params.page >= pages}
                onClick={() => params.setPage(params.page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : null}

      {!isPending && !isError && rows.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-8">
          <span className="text-[16px]">
            {anyFilter ? "No clubs match" : "No clubs yet"}
          </span>
          {anyFilter ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => params.clearParams(["q", "org", "segment", "sort"])}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      <CreateClubWizard open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
