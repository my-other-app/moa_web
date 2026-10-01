"use client";

import { Avatar, AvatarFallback, Badge, type DataTableColumn } from "@moa/ui";

import { ResourceList } from "@/components/resource-list";
import { useListParams } from "@/hooks/use-list-params";
import { formatDate, initials } from "@/lib/format";
import { useUsers } from "../queries";
import type { AdminUser } from "../schemas";

const USER_TYPE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  club: "secondary",
  app_user: "outline",
  guest: "outline",
};

const columns: DataTableColumn<AdminUser>[] = [
  {
    key: "user",
    header: "User",
    cell: (row) => (
      <div className="flex items-center gap-3">
        <Avatar className="size-8">
          <AvatarFallback className="text-[11px]">
            {initials(row.full_name ?? row.username)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium">{row.full_name || row.username}</p>
          <p className="text-muted-foreground truncate text-xs">@{row.username}</p>
        </div>
      </div>
    ),
  },
  {
    key: "email",
    header: "Email",
    cell: (row) => (
      <span className="text-muted-foreground truncate">{row.email || "--"}</span>
    ),
  },
  {
    key: "phone",
    header: "Phone",
    className: "hidden lg:table-cell",
    headerClassName: "hidden lg:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground tabular-nums">{row.phone || "--"}</span>
    ),
  },
  {
    key: "type",
    header: "Type",
    cell: (row) => (
      <Badge variant={USER_TYPE_VARIANT[row.user_type] ?? "outline"}>
        {row.user_type.replace("_", " ")}
      </Badge>
    ),
  },
  {
    key: "joined",
    header: "Joined",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground tabular-nums">
        {formatDate(row.created_at)}
      </span>
    ),
  },
];

export function UsersTable() {
  const params = useListParams();
  const { data, isPending, isError } = useUsers({
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
      searchPlaceholder="Search by name, username or email…"
      emptyTitle="No users yet"
      emptyDescription="People who sign up through the app will appear here."
    />
  );
}
