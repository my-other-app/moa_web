"use client";

import Link from "next/link";
import { EyeIcon, GlobeIcon, MapPinIcon } from "lucide-react";
import { StatusBadge, type DataTableColumn } from "@moa/ui";

import { ResourceList, formatCurrency, formatDateTime, formatNumber, useListParams } from "@moa/app-kit";
import { useEvents } from "../queries";
import type { AdminEvent } from "../schemas";

const columns: DataTableColumn<AdminEvent>[] = [
  {
    key: "event",
    header: "Event",
    cell: (row) => (
      <div className="min-w-0">
        <Link
          href={`/events/${row.id}`}
          className="block truncate font-medium underline-offset-4 hover:underline"
        >
          {row.name}
        </Link>
        <p className="text-muted-foreground truncate text-xs">
          {row.club?.name ?? "No club"}
          {row.category?.name ? ` · ${row.category.name}` : ""}
        </p>
      </div>
    ),
  },
  {
    key: "when",
    header: "When",
    cell: (row) => (
      <span className="text-muted-foreground tabular-nums">
        {formatDateTime(row.event_datetime)}
      </span>
    ),
  },
  {
    key: "where",
    header: "Where",
    className: "hidden lg:table-cell",
    headerClassName: "hidden lg:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 truncate">
        {row.is_online ? (
          <>
            <GlobeIcon className="size-3.5 shrink-0" /> Online
          </>
        ) : (
          <>
            <MapPinIcon className="size-3.5 shrink-0" />
            {row.location_name || "--"}
          </>
        )}
      </span>
    ),
  },
  {
    key: "fee",
    header: "Fee",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) =>
      row.has_fee ? (
        <span className="tabular-nums">{formatCurrency(row.reg_fee)}</span>
      ) : (
        <span className="text-muted-foreground">Free</span>
      ),
  },
  {
    key: "views",
    header: "Views",
    className: "hidden xl:table-cell text-right",
    headerClassName: "hidden xl:table-cell text-right",
    cell: (row) => (
      <span className="text-muted-foreground inline-flex items-center gap-1 tabular-nums">
        <EyeIcon className="size-3.5" />
        {formatNumber(row.page_views ?? 0)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "text-right",
    headerClassName: "text-right",
    cell: (row) =>
      row.is_deleted ? (
        <StatusBadge tone="destructive" label="Deleted" />
      ) : (
        <StatusBadge tone="success" label="Live" />
      ),
  },
];

export function EventsTable() {
  const params = useListParams();
  const { data, isPending, isError } = useEvents({
    search: params.search || undefined,
    offset: params.offset,
    limit: params.pageSize,
  });

  return (
    <ResourceList
      page={data}
      isPending={isPending}
      isError={isError}
      columns={columns}
      rowKey={(row) => row.id}
      params={params}
      searchPlaceholder="Search events…"
      emptyTitle="No events yet"
      emptyDescription="Events created by clubs will appear here."
    />
  );
}
