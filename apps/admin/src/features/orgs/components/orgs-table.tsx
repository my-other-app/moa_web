"use client";

import * as React from "react";
import Link from "next/link";
import { Badge, StatusBadge, Switch, Tooltip, TooltipContent, TooltipTrigger, type DataTableColumn } from "@moa/ui";

import {
  ListFilters,
  ResourceList,
  useListParams,
  useLocalPage,
} from "@moa/app-kit";
import { ExportButton } from "@/components/export-button";
import { SavedViews } from "@/components/saved-views";
import { useOrgs, useSetOrgBlocked } from "../queries";
import { ORG_TYPES, type Org } from "../schemas";

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

const ORG_FILTERS = [
  {
    key: "type",
    label: "Type",
    options: ORG_TYPES.map((type) => ({
      value: type,
      label: type[0]!.toUpperCase() + type.slice(1),
    })),
  },
  {
    key: "status",
    label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "blocked", label: "Blocked" },
    ],
  },
] as const;

const ORG_SORT = {
  options: [
    { value: "name", label: "Name" },
    { value: "type", label: "Type" },
  ],
  defaultValue: "name",
  defaultOrder: "asc",
} as const;

const ORG_CSV = [
  { header: "ID", value: (o: Org) => o.id },
  { header: "Name", value: (o: Org) => o.name },
  { header: "Type", value: (o: Org) => o.type ?? "" },
  { header: "Address", value: (o: Org) => o.address ?? "" },
  { header: "Email", value: (o: Org) => o.email ?? "" },
  { header: "Phone", value: (o: Org) => o.phone ?? "" },
  { header: "Status", value: (o: Org) => (o.is_blocked ? "Blocked" : "Active") },
] as const;

export function OrgsTable() {
  const params = useListParams();
  const { data, isPending, isError } = useOrgs();

  /*
   * Filtered and sorted in the browser, unlike the other three lists.
   * /orgs/list returns every row with no pagination, so the page already has
   * the whole collection -- adding server-side parameters would mean an API
   * change for data that is already here, and organisations number in the
   * tens.
   */
  const type = params.param("type");
  const status = params.param("status");
  const sort = params.param("sort") ?? ORG_SORT.defaultValue;
  const order = params.param("order") ?? ORG_SORT.defaultOrder;

  const rows = React.useMemo(() => {
    if (!data) return data;
    const filtered = data.filter((org) => {
      if (type && org.type !== type) return false;
      if (status === "blocked" && !org.is_blocked) return false;
      if (status === "active" && org.is_blocked) return false;
      return true;
    });
    const direction = order === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = String((sort === "type" ? a.type : a.name) ?? "");
      const right = String((sort === "type" ? b.type : b.name) ?? "");
      return left.localeCompare(right) * direction;
    });
  }, [data, type, status, sort, order]);

  const page = useLocalPage(rows, params, matches);

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
      toolbar={<>
          <ListFilters params={params} filters={ORG_FILTERS} sort={ORG_SORT} />
          <SavedViews
            storageKey="organisations"
            presets={[{ name: "Blocked", query: "status=blocked" }]}
          />
        </>}
      actions={
        <ExportButton
          filename="organisations"
          columns={ORG_CSV}
          disabled={!rows}
          /*
           * Already filtered and sorted in memory; the search is applied here
           * as the list applies it, so the file holds what is on screen. Paged
           * by the exporter's own offset: handing back the whole list for
           * every page repeated it until the 5,000-row cap.
           */
          fetchPage={async (offset, limit) => {
            const query = params.search.trim().toLowerCase();
            const all = (rows ?? []).filter((org) => !query || matches(org, query));
            return { items: all.slice(offset, offset + limit), total: all.length };
          }}
        />
      }
    />
  );
}
