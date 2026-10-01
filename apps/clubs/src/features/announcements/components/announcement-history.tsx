"use client";

import { MegaphoneIcon } from "lucide-react";
import { ResourceList, formatDateTime, formatNumber, useListParams } from "@moa/app-kit";
import type { DataTableColumn } from "@moa/ui";

import { useAnnouncementHistory } from "../queries";
import type { Announcement } from "../schemas";

const columns: DataTableColumn<Announcement>[] = [
  {
    key: "announcement",
    header: "Announcement",
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.title || "Untitled"}</p>
        <p className="text-muted-foreground line-clamp-1 text-xs">
          {row.body || row.message || ""}
        </p>
      </div>
    ),
  },
  {
    key: "event",
    header: "Event",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground truncate">{row.event_name || "--"}</span>
    ),
  },
  {
    key: "sent",
    header: "Recipients",
    className: "text-right",
    headerClassName: "text-right",
    cell: (row) => (
      <span className="tabular-nums">{formatNumber(row.sent_count ?? 0)}</span>
    ),
  },
  {
    key: "when",
    header: "Sent",
    className: "hidden sm:table-cell",
    headerClassName: "hidden sm:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground tabular-nums">
        {formatDateTime(row.created_at)}
      </span>
    ),
  },
];

export function AnnouncementHistory() {
  const params = useListParams();
  const { data, isPending, isError } = useAnnouncementHistory({
    offset: params.offset,
    limit: params.pageSize,
  });

  // The history endpoint returns { items, total } without limit/offset, so
  // adapt it to the shape ResourceList expects.
  const page = data
    ? {
        limit: params.pageSize,
        offset: params.offset,
        total: data.total,
        next: null,
        items: data.items,
      }
    : undefined;

  return (
    <ResourceList
      page={page}
      isPending={isPending}
      isError={isError}
      columns={columns}
      // Falls back to a composite of the fields that identify a send, since
      // the history endpoint does not guarantee an id. Math.random() here
      // would mint a new key every render and remount every row.
      rowKey={(row) => row.id ?? `${row.event_id ?? "e"}-${row.created_at ?? ""}-${row.title ?? ""}`}
      params={params}
      searchPlaceholder="Search announcements…"
      emptyTitle="No announcements yet"
      emptyDescription="Announcements you send to event participants will be listed here."
      emptyAction={
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <MegaphoneIcon className="size-3.5" />
          Send one from an event
        </span>
      }
    />
  );
}
