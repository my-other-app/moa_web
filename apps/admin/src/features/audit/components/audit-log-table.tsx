"use client";

import { ListFilters, ResourceList, formatDateTime, initials, useListParams } from "@moa/app-kit";
import { Avatar, AvatarFallback, Badge, type DataTableColumn } from "@moa/ui";

import { useAuditActions, useAuditLog } from "../queries";
import type { AuditEntry } from "../schemas";

/**
 * Who did what.
 *
 * Until this existed the dashboard could delete clubs and events, approve
 * registrations, award badges and block organisations with no record of any
 * of it. An incident had no answer and none could be reconstructed.
 */
const columns: DataTableColumn<AuditEntry>[] = [
  {
    key: "actor",
    header: "Who",
    cell: (row) => (
      <div className="flex items-center gap-2">
        <Avatar className="size-7">
          <AvatarFallback className="text-[10px]">
            {initials(row.actor?.full_name ?? row.actor?.email ?? "?")}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {row.actor?.full_name ?? "Unknown"}
          </p>
          {/* The stored email survives the account being deleted. */}
          <p className="text-muted-foreground truncate text-xs">
            {row.actor?.email ?? "--"}
          </p>
        </div>
      </div>
    ),
  },
  {
    key: "what",
    header: "What",
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate text-sm">{row.summary ?? row.action}</p>
        <Badge variant="outline" className="mt-0.5 font-mono text-[10px]">
          {row.action}
        </Badge>
      </div>
    ),
  },
  {
    key: "entity",
    header: "Record",
    className: "hidden lg:table-cell",
    headerClassName: "hidden lg:table-cell",
    cell: (row) =>
      row.entity_type ? (
        <span className="text-muted-foreground text-xs">
          {row.entity_type} #{row.entity_id}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">--</span>
      ),
  },
  {
    key: "ip",
    header: "From",
    className: "hidden xl:table-cell",
    headerClassName: "hidden xl:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground font-mono text-xs">
        {row.ip_address ?? "--"}
      </span>
    ),
  },
  {
    key: "when",
    header: "When",
    cell: (row) => (
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatDateTime(row.created_at)}
      </span>
    ),
  },
];

export function AuditLogTable() {
  const params = useListParams();
  const { data: actions = [] } = useAuditActions();

  const { data, isPending, isError } = useAuditLog({
    action: params.param("action"),
    entityType: params.param("entity_type"),
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
      // The log has no text search; the filters below are the way in.
      searchPlaceholder="Filter below"
      emptyTitle="Nothing recorded yet"
      emptyDescription="Admin actions appear here as they happen."
      toolbar={
        <ListFilters
          params={params}
          filters={[
            {
              key: "action",
              label: "Action",
              options: actions.map((action) => ({ value: action, label: action })),
            },
            {
              key: "entity_type",
              label: "Record type",
              options: [
                { value: "club", label: "Clubs" },
                { value: "event", label: "Events" },
                { value: "org", label: "Organisations" },
                { value: "badge", label: "Badges" },
                { value: "user", label: "Users" },
              ],
            },
          ]}
        />
      }
    />
  );
}
