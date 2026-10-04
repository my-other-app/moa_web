"use client";

import { Loader2Icon, Undo2Icon } from "lucide-react";
import { ResourceList, formatDate, initials, useListParams } from "@moa/app-kit";
import {
  Avatar,
  AvatarFallback,
  Button,
  StatusBadge,
  cn,
  type DataTableColumn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useDeletedClubs, useRestoreClub } from "../queries";
import type { AdminClub } from "../schemas";

/**
 * Soft-deleted clubs, and the undo.
 *
 * Everything in the product soft-deletes and nothing restored them, so
 * "reject" and "delete" were permanent in practice -- the confirm dialogs
 * said a developer could undo it, which was true and also an admission that
 * the product could not.
 */
function RestoreButton({ club }: { club: AdminClub }) {
  const restore = useRestoreClub();
  return (
    <Button
      size="xs"
      variant="outline"
      className={pressable}
      disabled={restore.isPending}
      onClick={() => restore.mutate(club.id)}
    >
      {restore.isPending ? <Loader2Icon className="animate-spin" /> : <Undo2Icon />}
      Restore
    </Button>
  );
}

const columns: DataTableColumn<AdminClub>[] = [
  {
    key: "club",
    header: "Club",
    cell: (row) => (
      <div className="flex items-center gap-3">
        <Avatar className="size-8">
          <AvatarFallback className="text-[11px]">
            {initials(row.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {row.location_name || "No location"}
          </p>
        </div>
      </div>
    ),
  },
  {
    key: "state",
    header: "Was",
    cell: (row) => (
      // Restoring deliberately does not re-verify, so a club deleted while
      // pending comes back pending -- worth saying before the undo.
      <StatusBadge
        tone={row.is_verified ? "success" : "warning"}
        label={row.is_verified ? "Verified" : "Pending approval"}
      />
    ),
  },
  {
    key: "created",
    header: "Created",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatDate(row.created_at)}
      </span>
    ),
  },
  {
    key: "actions",
    header: <span className="block text-right">Restore</span>,
    className: "text-right",
    headerClassName: "text-right",
    cell: (row) => (
      <div className="flex justify-end">
        <RestoreButton club={row} />
      </div>
    ),
  },
];

export function TrashTable() {
  const params = useListParams();
  const { data, isPending, isError } = useDeletedClubs({
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
      searchPlaceholder="Deleted clubs"
      emptyTitle="Nothing deleted"
      emptyDescription="Clubs you delete or reject appear here and can be restored."
    />
  );
}
