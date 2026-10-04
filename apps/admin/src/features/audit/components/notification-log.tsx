"use client";

import { ResourceList, formatDateTime, formatNumber, useListParams } from "@moa/app-kit";
import { Badge, type DataTableColumn } from "@moa/ui";

import { useSentNotifications } from "../queries";
import type { SentNotification } from "../schemas";

/**
 * Every announcement pushed to a phone, across all clubs.
 *
 * The only history endpoint is scoped to the calling club, so nobody could
 * review what the platform had sent -- the one action in the product that
 * reaches someone's device and cannot be recalled.
 */
const columns: DataTableColumn<SentNotification>[] = [
  {
    key: "message",
    header: "Message",
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.title ?? "--"}</p>
        <p className="text-muted-foreground line-clamp-1 text-xs">
          {row.description ?? ""}
        </p>
      </div>
    ),
  },
  {
    key: "from",
    header: "From",
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate text-sm">{row.club_name ?? "--"}</p>
        <p className="text-muted-foreground truncate text-xs">
          {row.event_name ?? ""}
        </p>
      </div>
    ),
  },
  {
    key: "reach",
    header: "Reach",
    cell: (row) => {
      const rate = row.sent_count > 0 ? (row.read_count / row.sent_count) * 100 : 0;
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums">
            {formatNumber(row.sent_count)} sent
          </span>
          <Badge variant={rate >= 50 ? "secondary" : "outline"}>
            {Math.round(rate)}% read
          </Badge>
        </div>
      );
    },
  },
  {
    key: "when",
    header: "When",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatDateTime(row.created_at)}
      </span>
    ),
  },
];

export function NotificationLog() {
  const params = useListParams();
  const { data, isPending, isError } = useSentNotifications({
    offset: params.offset,
    limit: params.pageSize,
  });

  return (
    <ResourceList
      page={data}
      isPending={isPending}
      isError={isError}
      columns={columns}
      rowKey={(row) => `${row.title}-${row.created_at}`}
      params={params}
      searchPlaceholder="Announcements"
      emptyTitle="Nothing sent yet"
      emptyDescription="Announcements clubs push to their followers appear here."
    />
  );
}
