"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlusIcon, UploadIcon } from "lucide-react";
import { formatCurrency, formatDateTime, relativeTime } from "@moa/app-kit";
import { Button, DataTable, Input, NativeSelect, Pager, SearchField, Segmented, StatusBadge, type DataTableColumn, type DataTableSort } from "@moa/ui";
import { useDebouncedValue } from "@moa/ui/hooks";

import { ExcelExportButton } from "@/components/excel-export-button";
import { LEAD_TYPES, LEAD_TYPE_LABEL, followUpLabel, leadTypeLabel, membersOf, useTeamRights, useTeams } from "@/features/teamwork";

import { leadsExportUrl } from "../api";
import { useLeads } from "../queries";
import { DUE_FILTERS, STAGES, STAGE_LABEL, prefillFrom, stageLabel, type LeadRow } from "../schemas";
import { ImportDialog } from "./import-dialog";
import { LeadBoard } from "./lead-board";
import { NewLeadDialog } from "./new-lead-dialog";
import { useStageMover } from "./stage-mover";

const PAGE = 50;
/** The board shows every lead the filters match, up to this many. */
const BOARD_MAX = 500;
type View = "board" | "table";

const STAGE_TONE: Record<string, "default" | "info" | "warning" | "success" | "destructive"> = { won: "success", lost: "destructive", negotiation: "warning", proposal: "warning" };

/**
 * Leads: the board by stage (drag a card to move it) and a table, with
 * filters by type, owner, city and follow-up due. New lead and Import are
 * for Sales and the owners; everyone reads.
 */
export function LeadsPage() {
  const rights = useTeamRights();
  const teams = useTeams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefill = React.useMemo(() => prefillFrom(new URLSearchParams(searchParams?.toString() ?? "")), [searchParams]);
  const [view, setView] = React.useState<View>("board");
  const [type, setType] = React.useState("");
  const [stage, setStage] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [city, setCity] = React.useState("");
  const [due, setDue] = React.useState("");
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  // A column clicked in the table; null: latest activity first (the server's own).
  const [sort, setSort] = React.useState<DataTableSort | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const mover = useStageMover();
  const sales = membersOf(teams.data, "sales");
  const cityQuery = useDebouncedValue(city.trim(), 300);

  // "Make a lead" (a speaker's page) arrives with ?new=1&name=…: the form opens filled in, until closed.
  const [prefillClosed, setPrefillClosed] = React.useState(false);
  const formOpen = creating || (prefill !== null && rights.createLeads && !prefillClosed);

  const filters = { type: type || undefined, stage: view === "table" ? stage || undefined : undefined, owner: owner === "me" ? (rights.meId ?? undefined) : owner ? Number(owner) : undefined, city: cityQuery || undefined, due: due || undefined, q: search || undefined };
  const { data, isPending, isError, isFetching } = useLeads(view === "board" ? { view, ...filters, page: 1, pageSize: BOARD_MAX } : { view, ...filters, sort: sort?.key, order: sort?.order, page, pageSize: PAGE });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: DataTableColumn<LeadRow>[] = [
    {
      key: "name",
      sortable: true,
      header: "Organisation",
      cell: (l) => (
        <div className="min-w-0">
          <Link href={`/teamwork/leads/${l.id}`} className="font-medium underline-offset-2 hover:underline">
            {l.name}
          </Link>
          <p className="text-ink-3 m-0 text-xs">
            {leadTypeLabel(l.type)}
            {l.city ? ` · ${l.city}` : ""}
          </p>
        </div>
      ),
    },
    { key: "stage", header: "Stage", sortable: true, cell: (l) => <StatusBadge tone={STAGE_TONE[l.stage] ?? "info"} label={stageLabel(l.stage)} /> },
    { key: "owner", header: "Owner", cell: (l) => l.owner?.name ?? <span className="text-ink-3">No owner</span> },
    { key: "value", header: "Value", sortable: true, firstOrder: "desc", className: "text-right", headerClassName: "text-right", cell: (l) => <span className="tabular-nums">{l.value_inr ? formatCurrency(l.value_inr) : "—"}</span> },
    {
      key: "next",
      header: "Next step",
      cell: (l) =>
        l.next_follow_up ? (
          <span className={l.overdue ? "text-refuse text-xs font-medium" : "text-xs"}>
            {followUpLabel(l.next_follow_up.kind)} · {formatDateTime(l.next_follow_up.due_at)}
            {l.overdue ? " · overdue" : ""}
          </span>
        ) : (
          <span className="text-caution text-xs">None</span>
        ),
    },
    { key: "contacts", header: "Contacts", className: "hidden lg:table-cell text-right", headerClassName: "hidden lg:table-cell text-right", cell: (l) => l.contacts_count },
    { key: "updated", header: "Updated", sortable: true, firstOrder: "desc", className: "hidden xl:table-cell", headerClassName: "hidden xl:table-cell", cell: (l) => <span className="text-ink-3 text-xs">{relativeTime(l.updated_at)}</span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="View"
          value={view}
          options={[
            { value: "board", label: "Board" },
            { value: "table", label: "Table" },
          ]}
          onChange={reset(setView)}
        />
        <div className="flex-1" />
        {rights.createLeads ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
              <UploadIcon /> Import
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <PlusIcon /> New lead
            </Button>
          </>
        ) : null}
        {rights.readBodies ? <ExcelExportButton href={leadsExportUrl(filters)} stem="leads" disabled={!data || data.total === 0} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchField label="Search leads" placeholder="Organisation, contact or email…" value={q} onChange={setQ} onCommit={(v) => reset(setSearch)(v.trim())} className="w-[260px]" />
        <NativeSelect aria-label="Type" size="sm" className="w-auto" value={type} onChange={(e) => reset(setType)(e.target.value)}>
          <option value="">Every type</option>
          {LEAD_TYPES.map((t) => (
            <option key={t} value={t}>
              {LEAD_TYPE_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
        {view === "table" ? (
          <NativeSelect aria-label="Stage" size="sm" className="w-auto" value={stage} onChange={(e) => reset(setStage)(e.target.value)}>
            <option value="">Every stage</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <NativeSelect aria-label="Owner" size="sm" className="w-auto" value={owner} onChange={(e) => reset(setOwner)(e.target.value)}>
          <option value="">Anyone&apos;s</option>
          <option value="me">Mine</option>
          {sales.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name || m.email}
            </option>
          ))}
        </NativeSelect>
        <Input aria-label="City" placeholder="City" className="input-sm h-8 w-[140px]" value={city} onChange={(e) => reset(setCity)(e.target.value)} />
        <NativeSelect aria-label="Follow-up due" size="sm" className="w-auto" value={due} onChange={(e) => reset(setDue)(e.target.value)}>
          {DUE_FILTERS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {view === "board" ? (
        isError ? (
          <p className="text-ink-3 m-0 text-sm">The leads could not be read.</p>
        ) : (
          <LeadBoard items={data?.items ?? []} counts={data?.by_stage ?? {}} onMove={(l, to) => mover.request({ id: l.id, name: l.name, stage: l.stage, ownerId: l.owner?.id }, to)} />
        )
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.items}
            rowKey={(l) => l.id}
            isLoading={isPending}
            isError={isError}
            emptyMessage="No leads match."
            sort={sort}
            onSortChange={(next) => {
              setSort(next);
              setPage(1);
            }}
          />
          {data && data.total > 0 ? <Pager page={page} pageCount={Math.max(1, Math.ceil(data.total / PAGE))} total={data.total} pageSize={PAGE} noun={["lead", "leads"]} busy={isFetching} onPage={setPage} /> : null}
        </>
      )}
      {view === "board" && data && data.total > data.items.length ? <p className="text-ink-3 m-0 text-[12px]">The board shows {data.items.length} of {data.total}; narrow the filters or use the table for the rest.</p> : null}

      {mover.element}
      {rights.createLeads ? (
        <>
          <NewLeadDialog
            open={formOpen}
            prefill={creating ? null : prefill}
            onOpenChange={(open) => {
              setCreating(open);
              if (open || !prefill) return;
              // The prefill came in the address: drop it, so a refresh doesn't open the form again.
              setPrefillClosed(true);
              router.replace("/teamwork/leads");
            }}
          />
          <ImportDialog open={importing} onOpenChange={setImporting} />
        </>
      ) : null}
    </div>
  );
}
