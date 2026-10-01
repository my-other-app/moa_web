"use client";

import Image from "next/image";
import { Avatar, AvatarFallback, StatusBadge, type DataTableColumn } from "@moa/ui";

import { ResourceList, formatDate, initials, pickImage, useListParams } from "@moa/app-kit";
import { useClubs } from "../queries";
import type { AdminClub } from "../schemas";
import { ClubActions } from "./club-actions";

const columns: DataTableColumn<AdminClub>[] = [
  {
    key: "club",
    header: "Club",
    cell: (row) => {
      const logo = pickImage(row.logo, ["thumbnail", "medium", "original"]);
      return (
        <div className="flex items-center gap-3">
          {logo ? (
            <Image
              src={logo}
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-full object-cover"
              unoptimized
            />
          ) : (
            <Avatar className="size-8">
              <AvatarFallback className="text-[11px]">
                {initials(row.name)}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{row.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {row.location_name || "No location"}
            </p>
          </div>
        </div>
      );
    },
  },
  {
    key: "contact",
    header: "Contact",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => (
      <div className="min-w-0">
        <p className="text-muted-foreground truncate text-sm">
          {row.contact_email || "--"}
        </p>
        <p className="text-muted-foreground truncate text-xs tabular-nums">
          {row.contact_phone || ""}
        </p>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => (
      <StatusBadge
        tone={row.is_verified ? "success" : "warning"}
        label={row.is_verified ? "Verified" : "Pending"}
      />
    ),
  },
  {
    key: "created",
    header: "Created",
    className: "hidden lg:table-cell",
    headerClassName: "hidden lg:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground tabular-nums">
        {formatDate(row.created_at)}
      </span>
    ),
  },
  {
    key: "actions",
    header: <span className="sr-only">Actions</span>,
    className: "text-right",
    headerClassName: "text-right",
    cell: (row) => <ClubActions club={row} />,
  },
];

export function ClubsTable() {
  const params = useListParams();
  const { data, isPending, isError } = useClubs({
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
      searchPlaceholder="Search clubs…"
      emptyTitle="No clubs yet"
      emptyDescription="Clubs created by organisers will appear here for approval."
    />
  );
}
