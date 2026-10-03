"use client";

import * as React from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { useListParams } from "@moa/app-kit";
import { pageCount } from "@moa/api";
import { Button, EmptyState, Pagination, Skeleton, StatusBadge, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { Icon } from "@/components/icon";
import { exportUrl } from "../api";
import { useMarkAttendance, useRegistrations } from "../queries";
import type { Registration } from "../schemas";

/**
 * Registrations from the design (node 301:850): two underlined tabs, a search
 * field and a download button above a table whose header row is a solid mint
 * band inside a hairline-bordered card.
 *
 * Not the shared ResourceList: that renders a bordered shadcn table with its
 * own toolbar and pagination layout, and every part of this -- the band, the
 * 20px light row type, the tab row sitting outside the card -- would have to
 * be overridden.
 */
type Tab = "registration" | "attendance";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative pb-1 text-xl font-medium transition-colors",
        "focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]",
        active
          ? "text-[var(--swatch-ink)]"
          : "text-[var(--swatch-grey-light)] hover:text-[var(--swatch-grey)]"
      )}
    >
      {children}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-px block h-px bg-[var(--swatch-ink)]"
        />
      ) : null}
    </button>
  );
}

function CheckInButton({ eventId, row }: { eventId: number; row: Registration }) {
  const mark = useMarkAttendance(eventId);

  if (row.is_attended) return <StatusBadge tone="success" label="Attended" />;

  return (
    <Button
      size="xs"
      variant="outline"
      className={pressable}
      disabled={mark.isPending}
      onClick={() => mark.mutate(row.id)}
      // The API has no un-mark endpoint, so this is one-way.
      title="Marks attendance — this cannot be undone here"
    >
      {mark.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
      Check in
    </Button>
  );
}

const CELL = "px-4 py-4 text-left align-middle";

export function RegistrationsPanel({ eventId }: { eventId: number }) {
  const params = useListParams();
  const [tab, setTab] = React.useState<Tab>("registration");

  // The attendance tab is the same list filtered to people who turned up --
  // the design shows one table with two headings, not two endpoints.
  const isAttendance = tab === "attendance";

  const { data, isPending, isError } = useRegistrations({
    eventId,
    search: params.search || undefined,
    isAttended: isAttendance ? true : undefined,
    offset: params.offset,
    limit: params.pageSize,
  });

  const rows = data?.items ?? [];
  const pages = pageCount(data?.total ?? null, params.pageSize) ?? 1;

  function switchTab(next: Tab) {
    setTab(next);
    params.setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-9">
          <TabButton
            active={tab === "registration"}
            onClick={() => switchTab("registration")}
          >
            Registration
          </TabButton>
          <TabButton
            active={isAttendance}
            onClick={() => switchTab("attendance")}
          >
            Attendance
          </TabButton>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-12 w-full items-center gap-1.5 rounded-lg border border-[var(--swatch-grey)] bg-white px-3 sm:w-[401px]">
            <Icon name="search-lg" className="text-[var(--swatch-grey)]" />
            <input
              value={params.searchInput}
              onChange={(e) => params.setSearchInput(e.target.value)}
              placeholder="Search for participants"
              aria-label="Search for participants"
              className="w-full bg-transparent text-base font-light outline-none placeholder:text-[var(--swatch-grey)]"
            />
          </div>

          <Button
            asChild
            className={cn(
              "h-12 shrink-0 gap-4 rounded-lg bg-[var(--swatch-ink)] px-4 text-xs font-normal text-white hover:bg-[var(--swatch-ink)]/90",
              pressable
            )}
          >
            {/* A real navigation, not fetch: the browser handles the file and
                the cookie rides along because the gateway is same-origin. The
                design labels this CSV; the endpoint returns an xlsx workbook,
                so the label says what actually downloads. */}
            <a
              href={exportUrl(eventId, isAttendance ? { isAttended: true } : {})}
              download
            >
              <Icon name="file-02" />
              Download Excel file
            </a>
          </Button>
        </div>
      </div>

      {isPending ? (
        <Skeleton className="h-[400px] w-full rounded-lg" />
      ) : isError ? (
        <EmptyState
          tone="muted"
          title="Could not load registrations"
          description="Try reloading the page."
        />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border-[0.5px] border-[var(--swatch-grey)] p-10">
          <EmptyState
            tone="muted"
            title={
              params.search
                ? "No matches"
                : isAttendance
                  ? "Nobody has been checked in yet"
                  : "No registrations yet"
            }
            description={
              params.search
                ? `Nothing matched “${params.search}”.`
                : isAttendance
                  ? "People you check in on the day will appear here."
                  : "People who register for this event will appear here."
            }
            action={
              params.search ? (
                <button
                  type="button"
                  onClick={params.reset}
                  className="text-primary text-sm underline-offset-4 hover:underline"
                >
                  Clear search
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border-[0.5px] border-[var(--swatch-grey)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="bg-[var(--swatch-mint)] text-xl font-light text-[var(--swatch-ink)]">
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Registration ID
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Participant Name
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Email
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Number
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    College Name
                  </th>
                  <th scope="col" className={cn(CELL, "font-light text-right")}>
                    <span className="sr-only">Attendance</span>
                  </th>
                </tr>
              </thead>
              <tbody className="text-xl font-light text-[var(--swatch-grey)]">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-[#e5e5e5] transition-colors hover:bg-[#fafafa]"
                  >
                    <td className={CELL}>{row.ticket_id || "--"}</td>
                    <td className={cn(CELL, "text-[var(--swatch-ink)]")}>
                      {row.full_name || row.name || row.user?.full_name || "Unknown"}
                    </td>
                    <td className={CELL}>
                      <span className="block max-w-[280px] truncate" title={row.email ?? ""}>
                        {row.email || "--"}
                      </span>
                    </td>
                    <td className={cn(CELL, "tabular-nums")}>{row.phone || "--"}</td>
                    <td className={CELL}>
                      <span
                        className="block max-w-[320px] truncate"
                        title={row.institution ?? ""}
                      >
                        {row.institution || "--"}
                      </span>
                    </td>
                    <td className={cn(CELL, "text-right")}>
                      <CheckInButton eventId={eventId} row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isPending && rows.length > 0 && pages > 1 ? (
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
