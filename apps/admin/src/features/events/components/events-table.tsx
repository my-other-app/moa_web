"use client";

import Link from "next/link";
import { EyeIcon, GlobeIcon, MapPinIcon } from "lucide-react";
import { StatusBadge, type DataTableColumn } from "@moa/ui";

import {
  ListFilters,
  ResourceList,
  formatCurrency,
  formatDateTime,
  formatNumber,
  useListParams,
} from "@moa/app-kit";
import { ExportButton } from "@/components/export-button";
import { SavedViews } from "@/components/saved-views";
import { fetchEvents } from "../api";
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

const EVENT_FILTERS = [
  {
    key: "is_ended",
    label: "When",
    allLabel: "Any time",
    options: [
      { value: "false", label: "Upcoming" },
      { value: "true", label: "Past" },
    ],
  },
  {
    key: "has_fee",
    label: "Entry",
    allLabel: "Free and paid",
    options: [
      { value: "true", label: "Paid" },
      { value: "false", label: "Free" },
    ],
  },
] as const;

const EVENT_SORT = {
  options: [
    { value: "created", label: "Created" },
    { value: "date", label: "Event date" },
    { value: "name", label: "Name" },
    { value: "views", label: "Page views" },
  ],
  defaultValue: "created",
} as const;

/** The query string carries strings; the API wants a boolean or nothing. */
function asBool(value: string | undefined): boolean | undefined {
  return value === undefined ? undefined : value === "true";
}

const EVENT_CSV = [
  { header: "ID", value: (e: AdminEvent) => e.id },
  { header: "Name", value: (e: AdminEvent) => e.name },
  { header: "Club", value: (e: AdminEvent) => e.club?.name ?? "" },
  { header: "Category", value: (e: AdminEvent) => e.category?.name ?? "" },
  { header: "When", value: (e: AdminEvent) => e.event_datetime ?? "" },
  { header: "Where", value: (e: AdminEvent) => e.location_name ?? "" },
  { header: "Online", value: (e: AdminEvent) => (e.is_online ? "yes" : "no") },
  { header: "Fee", value: (e: AdminEvent) => (e.has_fee ? e.reg_fee ?? 0 : 0) },
  { header: "Page views", value: (e: AdminEvent) => e.page_views ?? 0 },
] as const;

export function EventsTable() {
  const params = useListParams();
  const { data, isPending, isError } = useEvents({
    search: params.search || undefined,
    isEnded: asBool(params.param("is_ended")),
    hasFee: asBool(params.param("has_fee")),
    sort: params.param("sort"),
    order: params.param("order"),
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
      toolbar={<>
          <ListFilters params={params} filters={EVENT_FILTERS} sort={EVENT_SORT} />
          <SavedViews
            storageKey="events"
            presets={[
              { name: "Upcoming", query: "is_ended=false&sort=date&order=asc" },
              { name: "Paid events", query: "has_fee=true" },
              { name: "Most viewed", query: "sort=views&order=desc" },
            ]}
          />
        </>}
      actions={
        <ExportButton
          filename="events"
          columns={EVENT_CSV}
          fetchPage={(offset, limit) =>
            fetchEvents({
              search: params.search || undefined,
              isEnded: asBool(params.param("is_ended")),
              hasFee: asBool(params.param("has_fee")),
              sort: params.param("sort"),
              order: params.param("order"),
              offset,
              limit,
            })
          }
        />
      }
    />
  );
}
