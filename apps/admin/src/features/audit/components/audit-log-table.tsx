"use client";

import { ListFilters, PersonAvatar, ResourceList, formatDateTime, useListParams } from "@moa/app-kit";
import { Badge, type DataTableColumn } from "@moa/ui";

import { useAuditActions, useAuditLog } from "../queries";
import type { AuditEntry } from "../schemas";

/**
 * Who did what.
 *
 * Until this existed the dashboard could delete clubs and events, approve
 * registrations, award badges and block organisations with no record of any
 * of it. An incident had no answer and none could be reconstructed.
 */

/** Why, when the admin had to say: a session as someone else needs a reason. */
const reasonOf = (row: AuditEntry): string | null => {
  const reason = row.details?.reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
};

const columns: DataTableColumn<AuditEntry>[] = [
  {
    key: "actor",
    header: "Who",
    cell: (row) => (
      <div className="flex items-center gap-2">
        <PersonAvatar
          name={row.actor?.full_name ?? row.actor?.email}
          avatar={row.actor?.avatar}
          className="size-7"
          fallbackClassName="text-[10px]"
        />
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
    cell: (row) => {
      const reason = reasonOf(row);
      return (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.summary ?? row.action}</p>
          {reason ? (
            <p className="text-muted-foreground truncate text-xs" title={reason}>
              Reason: {reason}
            </p>
          ) : null}
          <Badge variant="outline" className="mt-0.5 font-mono text-[10px]">
            {row.action}
          </Badge>
        </div>
      );
    },
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
    search: params.search || undefined,
    offset: params.offset,
    limit: params.pageSize,
  });

  /*
   * The API says what it searched for (`search`, null for nothing). One
   * from before the log could be searched says nothing at all, and would
   * ignore the box: then there is no box, and the filters are the way in.
   * Until the first page answers, the box is offered.
   */
  const searchable = data === undefined || data.search !== undefined;

  return (
    <ResourceList
      page={data}
      isPending={isPending}
      isError={isError}
      columns={columns}
      rowKey={(row) => row.id}
      params={params}
      searchable={searchable}
      searchPlaceholder="Search who, what, record or reason"
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
