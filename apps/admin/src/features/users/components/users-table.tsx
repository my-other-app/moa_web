"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, Badge, type DataTableColumn } from "@moa/ui";

import {
  ListFilters,
  ResourceList,
  formatDate,
  initials,
  useListParams,
} from "@moa/app-kit";
import { ExportButton } from "@/components/export-button";
import { fetchUsers } from "../api";
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
          <Link
            href={`/users/${row.id}`}
            className="block truncate font-medium underline-offset-4 hover:underline"
          >
            {row.full_name || row.username}
          </Link>
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

const USER_FILTERS = [
  {
    key: "user_type",
    label: "Type",
    options: [
      { value: "app_user", label: "App users" },
      { value: "club", label: "Clubs" },
      { value: "admin", label: "Admins" },
      { value: "guest", label: "Guests" },
    ],
  },
  {
    key: "provider",
    label: "Sign-in",
    options: [
      { value: "google", label: "Google" },
      { value: "apple", label: "Apple" },
      { value: "email", label: "Email" },
    ],
  },
] as const;

const USER_SORT = {
  options: [
    { value: "joined", label: "Joined" },
    { value: "name", label: "Name" },
    { value: "email", label: "Email" },
    { value: "username", label: "Username" },
  ],
  defaultValue: "joined",
} as const;

const USER_CSV = [
  { header: "ID", value: (u: AdminUser) => u.id },
  { header: "Name", value: (u: AdminUser) => u.full_name ?? "" },
  { header: "Username", value: (u: AdminUser) => u.username },
  { header: "Email", value: (u: AdminUser) => u.email ?? "" },
  { header: "Phone", value: (u: AdminUser) => u.phone ?? "" },
  { header: "Type", value: (u: AdminUser) => u.user_type },
  { header: "Provider", value: (u: AdminUser) => u.provider ?? "" },
  { header: "Joined", value: (u: AdminUser) => u.created_at ?? "" },
] as const;

export function UsersTable() {
  const params = useListParams();
  const { data, isPending, isError } = useUsers({
    search: params.search || undefined,
    userType: params.param("user_type"),
    provider: params.param("provider"),
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
      searchPlaceholder="Search by name, username or email…"
      emptyTitle="No users yet"
      emptyDescription="People who sign up through the app will appear here."
      toolbar={<ListFilters params={params} filters={USER_FILTERS} sort={USER_SORT} />}
      actions={
        <ExportButton
          filename="users"
          columns={USER_CSV}
          fetchPage={(offset, limit) =>
            fetchUsers({
              search: params.search || undefined,
              userType: params.param("user_type"),
              provider: params.param("provider"),
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
