"use client";

import * as React from "react";
import { formatNumber, useListParams } from "@moa/app-kit";
import { Chip, InlineAlert, Pager, Skeleton, TabRail, cn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { useOpenReportCount, useReports } from "../queries";
import { TARGET_TYPES, isTargetType, type ReportStatus, type TargetType } from "../schemas";
import { ReportRow } from "./report-row";

export const PAGE_SIZE = 20;

const TYPE_PLURAL: Record<TargetType, string> = { thread: "Threads", comment: "Comments", user: "Users", club: "Clubs" };

const TYPE_FILTERS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "", label: "Everything" },
  ...TARGET_TYPES.map((t) => ({ key: t, label: TYPE_PLURAL[t] })),
];

/**
 * What app users reported, and the decisions on it. Open first: each with
 * Dismiss, Remove (a thread or a comment) and Suspend author for moderate
 * and above; viewers read the same rows without them. The tab, the kind of
 * thing and the page live in the URL, so "open reports on comments" is a
 * link an admin can send.
 */
export function ReportsPage() {
  const params = useListParams({ pageSize: PAGE_SIZE });
  const canModerate = useCan("moderate");
  const [now] = React.useState(() => new Date());
  const status: ReportStatus = params.param("status") === "resolved" ? "resolved" : "open";
  const rawType = params.param("type");
  const type = isTargetType(rawType) ? rawType : "";
  const pageSize = params.pageSize;

  const list = useReports({ status, targetType: type || undefined, offset: (params.page - 1) * pageSize, limit: pageSize });
  const openCount = useOpenReportCount();
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const open = openCount.data;

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-end gap-3.5">
        <div className="flex-1 basis-[300px]">
          <h2 className="m-0 text-[32px] leading-[1.12] tracking-[-0.015em]">Reports</h2>
          <span className="text-ink-3 text-[13px]">
            {open !== undefined ? `${formatNumber(open)} open · ` : ""}Threads, comments, people and clubs reported in the app. Decide them promptly.
          </span>
        </div>
      </header>

      <TabRail
        label="Report status"
        value={status}
        onChange={(key) => params.setParam("status", key === "resolved" ? "resolved" : undefined)}
        items={[
          { key: "open", label: "Open", count: open !== undefined ? formatNumber(open) : null },
          { key: "resolved", label: "Resolved" },
        ]}
      />

      <div role="group" aria-label="Reported thing" className="flex flex-wrap items-center gap-1.5">
        {TYPE_FILTERS.map((option) => (
          <Chip key={option.key || "all"} active={type === option.key} onClick={() => params.setParam("type", option.key || undefined)}>
            {option.label}
          </Chip>
        ))}
      </div>

      {list.isError ? (
        <InlineAlert tone="destructive" title="Could not load the reports">
          {list.error instanceof Error ? list.error.message : "Try again in a moment."}
        </InlineAlert>
      ) : list.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-8">
          <span className="text-[16px]">{type ? "Nothing matches" : status === "open" ? "Nothing to review" : "Nothing resolved yet"}</span>
          <span className="text-ink-2 text-[13px]">
            {type
              ? "Pick Everything to see the rest."
              : status === "open"
                ? "Reports from the app land here as they are made, and in the bell."
                : "Reports you dismiss or act on are kept here, with the decision and its note."}
          </span>
        </div>
      ) : (
        <div className={cn("bg-surface shadow-card overflow-hidden rounded-[var(--radius-card)]", list.isPlaceholderData && "opacity-60 transition-opacity")}>
          <ul aria-label={status === "open" ? "Open reports" : "Resolved reports"} className="divide-line-soft divide-y">
            {items.map((r) => (
              <ReportRow key={r.id} report={r} now={now} canModerate={canModerate} />
            ))}
          </ul>
          <div className="border-line-soft border-t px-3 py-2.5">
            <Pager
              page={params.page}
              pageCount={Math.max(1, Math.ceil(total / pageSize))}
              total={total}
              pageSize={pageSize}
              noun={["report", "reports"]}
              busy={list.isFetching}
              onPage={params.setPage}
              onPageSize={params.setPageSize}
            />
          </div>
        </div>
      )}
    </div>
  );
}
