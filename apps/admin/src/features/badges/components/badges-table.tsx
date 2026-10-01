"use client";

import { Badge as BadgeChip, type DataTableColumn } from "@moa/ui";

import { ResourceList } from "@/components/resource-list";
import { useListParams } from "@/hooks/use-list-params";
import { useLocalPage } from "@/hooks/use-local-page";
import { formatNumber } from "@/lib/format";
import { useBadges } from "../queries";
import type { Badge } from "../schemas";

const columns: DataTableColumn<Badge>[] = [
  {
    key: "badge",
    header: "Badge",
    cell: (row) => (
      <div className="flex items-center gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg border text-lg transition-transform duration-200 hover:scale-110 motion-reduce:transition-none"
          aria-hidden="true"
        >
          {row.emoji || "🏅"}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          <p className="text-muted-foreground truncate text-xs">{row.slug}</p>
        </div>
      </div>
    ),
  },
  {
    key: "description",
    header: "Description",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground line-clamp-2 text-sm">
        {row.description || "--"}
      </span>
    ),
  },
  {
    key: "type",
    header: "Type",
    cell: (row) => <BadgeChip variant="outline">{row.badge_type || "--"}</BadgeChip>,
  },
  {
    key: "rule",
    header: "Awarded when",
    className: "hidden lg:table-cell",
    headerClassName: "hidden lg:table-cell",
    cell: (row) =>
      row.trigger_metric ? (
        <span className="text-muted-foreground text-xs">
          <code className="bg-muted rounded px-1 py-0.5">{row.trigger_metric}</code>
          {row.threshold != null ? ` ≥ ${row.threshold}` : ""}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">Manual</span>
      ),
  },
  {
    key: "claimed",
    header: "Claimed",
    className: "text-right",
    headerClassName: "text-right",
    cell: (row) => (
      <span className="tabular-nums">{formatNumber(row.claimed_count ?? 0)}</span>
    ),
  },
];

const matches = (badge: Badge, query: string) =>
  [badge.name, badge.slug, badge.description, badge.badge_type]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(query));

export function BadgesTable() {
  const params = useListParams();
  const { data, isPending, isError } = useBadges();
  const page = useLocalPage(data, params, matches);

  return (
    <ResourceList
      page={page}
      isPending={isPending}
      isError={isError}
      columns={columns}
      rowKey={(row) => row.id}
      params={params}
      searchPlaceholder="Search badges…"
      emptyTitle="No badges defined"
      emptyDescription="Badge definitions control what users can earn."
    />
  );
}
