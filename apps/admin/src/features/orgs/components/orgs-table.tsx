"use client";

import * as React from "react";
import Link from "next/link";
import { Badge, StatusBadge, Switch, Tooltip, TooltipContent, TooltipTrigger, type DataTableColumn } from "@moa/ui";

import { ResourceList, useListParams, useLocalPage } from "@moa/app-kit";
import { useOrgs, useSetOrgBlocked } from "../queries";
import type { Org } from "../schemas";

function BlockToggle({ org }: { org: Org }) {
  const setBlocked = useSetOrgBlocked();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex justify-end">
          <Switch
            checked={!org.is_blocked}
            disabled={setBlocked.isPending}
            onCheckedChange={(checked) =>
              setBlocked.mutate({ id: org.id, blocked: !checked })
            }
            aria-label={org.is_blocked ? `Unblock ${org.name}` : `Block ${org.name}`}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {org.is_blocked
          ? "Blocked — its clubs are hidden from the app"
          : "Active — its clubs are visible"}
      </TooltipContent>
    </Tooltip>
  );
}

const columns: DataTableColumn<Org>[] = [
  {
    key: "name",
    header: "Organisation",
    cell: (row) => (
      <div className="min-w-0">
        <Link
          href={`/organizations/${row.id}`}
          className="block truncate font-medium underline-offset-4 hover:underline"
        >
          {row.name}
        </Link>
        <p className="text-muted-foreground truncate text-xs">
          {row.address || "No address"}
        </p>
      </div>
    ),
  },
  {
    key: "type",
    header: "Type",
    cell: (row) => <Badge variant="outline">{row.type || "unknown"}</Badge>,
  },
  {
    key: "contact",
    header: "Contact",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground truncate">{row.email || "--"}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "hidden sm:table-cell",
    headerClassName: "hidden sm:table-cell",
    cell: (row) => (
      <StatusBadge
        tone={row.is_blocked ? "destructive" : "success"}
        label={row.is_blocked ? "Blocked" : "Active"}
      />
    ),
  },
  {
    key: "toggle",
    header: <span className="text-right block">Active</span>,
    className: "text-right",
    headerClassName: "text-right",
    cell: (row) => <BlockToggle org={row} />,
  },
];

const matches = (org: Org, query: string) =>
  [org.name, org.email, org.address, org.type]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(query));

export function OrgsTable() {
  const params = useListParams();
  const { data, isPending, isError } = useOrgs();
  const page = useLocalPage(data, params, matches);

  return (
    <ResourceList
      page={page}
      isPending={isPending}
      isError={isError}
      columns={columns}
      rowKey={(row) => row.id}
      params={params}
      searchPlaceholder="Search organisations…"
      emptyTitle="No organisations"
      emptyDescription="Colleges and institutions appear here once added."
    />
  );
}
