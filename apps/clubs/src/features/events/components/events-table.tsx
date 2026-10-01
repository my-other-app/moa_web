"use client";

import * as React from "react";
import { EyeIcon, GlobeIcon, MapPinIcon, UserCheckIcon, UsersIcon } from "lucide-react";
import { ResourceList, formatCurrency, formatDateTime, formatNumber, useListParams } from "@moa/app-kit";
import {
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type DataTableColumn,
} from "@moa/ui";

import { useClubEvents } from "../queries";
import type { ClubEvent } from "../schemas";

type Scope = "upcoming" | "past" | "all";

const SCOPE_TO_IS_ENDED: Record<Scope, boolean | undefined> = {
  upcoming: false,
  past: true,
  all: undefined,
};

const columns: DataTableColumn<ClubEvent>[] = [
  {
    key: "event",
    header: "Event",
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.name}</p>
        <p className="text-muted-foreground truncate text-xs">
          {formatDateTime(row.event_datetime)}
        </p>
      </div>
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
    key: "registrations",
    header: "Registered",
    className: "text-right",
    headerClassName: "text-right",
    cell: (row) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
            <UsersIcon className="text-muted-foreground size-3.5" />
            {formatNumber(row.registration_count ?? 0)}
          </span>
        </TooltipTrigger>
        <TooltipContent>People who registered</TooltipContent>
      </Tooltip>
    ),
  },
  {
    key: "attended",
    header: "Checked in",
    className: "hidden sm:table-cell text-right",
    headerClassName: "hidden sm:table-cell text-right",
    cell: (row) => {
      const registered = row.registration_count ?? 0;
      const attended = row.attended_count ?? 0;
      const pct = registered > 0 ? Math.round((attended / registered) * 100) : null;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
              <UserCheckIcon className="text-muted-foreground size-3.5" />
              {formatNumber(attended)}
              {pct !== null ? (
                <span className="text-muted-foreground text-xs">({pct}%)</span>
              ) : null}
            </span>
          </TooltipTrigger>
          <TooltipContent>Attendees checked in on the day</TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    key: "fee",
    header: "Fee",
    className: "hidden xl:table-cell",
    headerClassName: "hidden xl:table-cell",
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
];

export function ClubEventsTable() {
  const params = useListParams();
  const [scope, setScope] = React.useState<Scope>("upcoming");

  const { data, isPending, isError } = useClubEvents({
    search: params.search || undefined,
    isEnded: SCOPE_TO_IS_ENDED[scope],
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
      searchPlaceholder="Search your events…"
      emptyTitle={scope === "past" ? "No past events" : "No upcoming events"}
      emptyDescription={
        scope === "past"
          ? "Events that have finished will be listed here."
          : "Events you publish will appear here with live registration counts."
      }
      toolbar={
        <Tabs
          value={scope}
          onValueChange={(v) => {
            setScope(v as Scope);
            // Changing scope changes the result set, so stay out of a page
            // number that may no longer exist.
            params.setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    />
  );
}
