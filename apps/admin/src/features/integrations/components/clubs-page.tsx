"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3Icon, Loader2Icon, PencilIcon, PlusIcon } from "lucide-react";
import { ListFilters, ResourceList, formatDate, formatDateTime, relativeTime, useListParams, type CsvColumn } from "@moa/app-kit";
import {
  Button,
  CardLabel,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FigurePanel,
  NativeSelect,
  Notice,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  StatTile,
  StatusBadge,
  Switch,
  cn,
  type DataTableColumn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { ClubPicker, type PickedClub } from "@/components/club-picker";
import { ExportButton } from "@/components/export-button";
import { useCan } from "@/hooks/use-can";

import { fetchAllocations } from "../api";
import { useAllocations, useClubUsage, usePlatformUsage, useSaveAllocation } from "../queries";
import { ACCESS_FILTERS, DEFAULT_MAX_KEYS, RATE_TIERS, TIER_INFO, allocationProblems, tierLabel, type Allocation, type AllocationForm, type RateTier } from "../schemas";
import { DailyBars } from "./parts";

const n = (v: number) => v.toLocaleString("en-IN");

/** The columns of the Excel and CSV files: what the list shows, and the notes. */
export const ALLOCATION_COLUMNS: CsvColumn<Allocation>[] = [
  { header: "Club", value: (r) => r.club.name },
  { header: "Club ID", value: (r) => r.club.id },
  { header: "API access", value: (r) => (r.allocated ? "On" : "Taken away") },
  { header: "Rate tier", value: (r) => tierLabel(r.rate_tier) },
  { header: "Max keys", value: (r) => r.max_keys },
  { header: "Active keys", value: (r) => r.keys_active },
  { header: "Partner apps", value: (r) => r.apps_connected },
  { header: "Webhook endpoints", value: (r) => r.endpoints },
  { header: "Requests, 30 days", value: (r) => r.requests_30d },
  { header: "Errors, 30 days", value: (r) => r.errors_30d },
  { header: "Last used", value: (r) => r.last_used_at ?? "" },
  { header: "Given", value: (r) => r.allocated_at ?? "" },
  { header: "Given by", value: (r) => r.allocated_by?.name ?? r.allocated_by?.email ?? "" },
  { header: "Notes", value: (r) => r.notes ?? "" },
];

type Editing = { club: PickedClub; row: Allocation | null } | { club: null; row: null };

/**
 * Integrations → Clubs with access: which clubs may use the API, at what
 * rate, with how many keys, and how much they use it. Giving access, changing
 * it and taking it away are for the platform's owners; the rest read it.
 */
export function ClubsAccessPage() {
  const params = useListParams();
  // Unset: every club that has had access, on or taken away.
  const status = params.param("status");
  const manage = useCan("manage_admins");
  const canExport = useCan("export_data");
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [usageOf, setUsageOf] = React.useState<Allocation | null>(null);
  const query = { status, search: params.search || undefined, offset: params.offset, limit: params.pageSize };
  const list = useAllocations(query);

  const columns: DataTableColumn<Allocation>[] = [
    {
      key: "club",
      header: "Club",
      cell: (r) => (
        <div className="min-w-0">
          <Link href={`/clubs/${r.club.id}`} className="block truncate font-medium underline-offset-4 hover:underline">
            {r.club.name}
          </Link>
          {r.notes ? (
            <p className="text-muted-foreground max-w-[260px] truncate text-xs" title={r.notes}>
              {r.notes}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "access",
      header: "Access",
      cell: (r) => (
        <div className="flex flex-col items-start gap-0.5">
          <StatusBadge tone={r.allocated ? "success" : "default"} label={r.allocated ? "On" : "Taken away"} />
          <span className="text-muted-foreground text-[11px]">
            {tierLabel(r.rate_tier)} · {r.keys_active}/{r.max_keys} keys
          </span>
        </div>
      ),
    },
    {
      key: "apps",
      header: "Apps · hooks",
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (r) => (
        <span className="text-muted-foreground text-xs tabular-nums">
          {r.apps_connected} {r.apps_connected === 1 ? "app" : "apps"} · {r.endpoints} {r.endpoints === 1 ? "endpoint" : "endpoints"}
        </span>
      ),
    },
    {
      key: "usage",
      header: "30 days",
      cell: (r) => (
        <span className="text-xs tabular-nums">
          {n(r.requests_30d)} <span className="text-muted-foreground">requests</span>
          {r.errors_30d ? <span className="text-refuse block">{n(r.errors_30d)} errors</span> : null}
        </span>
      ),
    },
    {
      key: "last",
      header: "Last used",
      className: "hidden lg:table-cell",
      headerClassName: "hidden lg:table-cell",
      cell: (r) =>
        r.last_used_at ? (
          <time className="text-muted-foreground text-xs" dateTime={r.last_used_at} title={formatDateTime(r.last_used_at)}>
            {relativeTime(r.last_used_at)}
          </time>
        ) : (
          <span className="text-muted-foreground text-xs">Never</span>
        ),
    },
    {
      key: "actions",
      header: <span className="block text-right">Action</span>,
      className: "text-right",
      headerClassName: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button size="xs" variant="outline" className={pressable} onClick={() => setUsageOf(r)} aria-label={`Usage of ${r.club.name}`}>
            <BarChart3Icon /> Usage
          </Button>
          {manage ? (
            <Button size="xs" variant="outline" className={pressable} onClick={() => setEditing({ club: { id: r.club.id, name: r.club.name }, row: r })} aria-label={`Change ${r.club.name}'s API access`}>
              <PencilIcon /> {r.allocated ? "Change" : "Give again"}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PlatformUsage />
      <ResourceList
        page={list.data ?? undefined}
        isPending={list.isPending}
        isError={list.isError}
        columns={columns}
        rowKey={(r) => r.club.id}
        params={params}
        searchPlaceholder="Club name or slug…"
        emptyTitle={status === "revoked" ? "No club has had its access taken away" : "No club has API access yet"}
        emptyDescription={status === "revoked" ? undefined : "Give a club access when it asks to connect its own systems. Nothing is on by default."}
        toolbar={<ListFilters params={params} filters={[{ key: "status", label: "Access", allLabel: "On or taken away", options: ACCESS_FILTERS.map((f) => ({ value: f.value, label: f.label })) }]} />}
        actions={
          <div className="flex items-center gap-2">
            {canExport ? (
              <ExportButton
                filename="api-access"
                sheet="API access"
                columns={ALLOCATION_COLUMNS}
                fetchPage={async (offset, limit) => (await fetchAllocations({ ...query, offset, limit })) ?? { items: [], total: 0 }}
              />
            ) : null}
            {manage ? (
              <Button size="sm" className={pressable} onClick={() => setEditing({ club: null, row: null })}>
                <PlusIcon /> Give a club access
              </Button>
            ) : null}
          </div>
        }
      />
      {editing ? <AllocationDialog editing={editing} onClose={() => setEditing(null)} /> : null}
      <UsageSheet row={usageOf} onClose={() => setUsageOf(null)} />
    </div>
  );
}

function PlatformUsage() {
  const usage = usePlatformUsage();
  const days = (usage.data?.days ?? []).map((d) => ({ date: d.date, total: d.requests, bad: d.errors }));
  const total = days.reduce((s, d) => s + d.total, 0);
  const bad = days.reduce((s, d) => s + d.bad, 0);
  if (usage.isError) return null;
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Platform usage">
      <CardLabel right={<span className="text-ink-3 text-[11px]">Every club and partner app · errors in red</span>}>API requests, 30 days</CardLabel>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Requests" value={usage.isPending ? "…" : n(total)} />
        <StatTile label="Errors" value={usage.isPending ? "…" : n(bad)} />
        <StatTile label="Error rate" value={usage.isPending ? "…" : total ? `${((bad / total) * 100).toFixed(1)}%` : "0%"} />
      </div>
      {usage.isPending ? <Skeleton className="h-[140px] rounded-xl" /> : total > 0 ? <DailyBars days={days} what="API requests" bad="errors" /> : null}
    </FigurePanel>
  );
}

/** Give access to a club, change its terms, or take it away. */
function AllocationDialog({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const save = useSaveAllocation();
  const row = editing.row;
  const [club, setClub] = React.useState<PickedClub | null>(editing.club);
  const [on, setOn] = React.useState(row ? row.allocated : true);
  const [form, setForm] = React.useState<AllocationForm>({
    tier: (RATE_TIERS as readonly string[]).includes(row?.rate_tier ?? "") ? (row!.rate_tier as RateTier) : "standard",
    maxKeys: String(row?.max_keys ?? DEFAULT_MAX_KEYS),
    notes: row?.notes ?? "",
  });
  const [tried, setTried] = React.useState(false);
  const problems = allocationProblems(form);
  const shown = tried ? problems : {};
  const taking = Boolean(row?.allocated) && !on;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!club || Object.keys(problems).length) return;
    save.mutate(
      { clubId: club.id, clubName: club.name, was: Boolean(row?.allocated), body: { allocated: on, rate_tier: form.tier, max_keys: Number(form.maxKeys), notes: form.notes.trim() || null } },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{row ? `${row.club.name}'s API access` : "Give a club API access"}</DialogTitle>
          <DialogDescription>Its owner and admins then make API keys and webhooks under Settings → Integrations in their dashboard.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {row ? null : (
            <div>
              <ClubPicker value={club} onChange={setClub} verifiedOnly />
              {tried && !club ? <p className="text-refuse m-0 mt-1 text-[12px]">Choose the club.</p> : null}
            </div>
          )}
          {row ? (
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="alloc-on" className="text-ink text-[13px] font-medium">
                API access
              </label>
              <Switch id="alloc-on" checked={on} onCheckedChange={setOn} aria-label="API access" />
            </div>
          ) : null}
          {taking ? (
            <Notice tone="refuse" tag="Taking it away">
              Every key {row!.club.name} made stops working at once, and its own webhooks stop. Its keys stay listed for it, revoked. Partner apps it connected aren&apos;t affected.
            </Notice>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="alloc-tier" className="eyebrow mb-1.5 block">
                Rate
              </label>
              <NativeSelect id="alloc-tier" className="h-10 w-full" value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as RateTier }))} disabled={!on}>
                {RATE_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER_INFO[t].label}: {n(TIER_INFO[t].read)} reads, {n(TIER_INFO[t].write)} changes a minute
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <label htmlFor="alloc-keys" className="eyebrow mb-1.5 block">
                Most keys
              </label>
              <input
                id="alloc-keys"
                className="input h-10 w-full"
                inputMode="numeric"
                value={form.maxKeys}
                onChange={(e) => setForm((f) => ({ ...f, maxKeys: e.target.value }))}
                disabled={!on}
                aria-invalid={shown.maxKeys ? true : undefined}
              />
              {shown.maxKeys ? <p className="text-refuse m-0 mt-1 text-[12px]">{shown.maxKeys}</p> : null}
            </div>
          </div>
          <div>
            <label htmlFor="alloc-notes" className="eyebrow mb-1.5 block">
              Notes (only admins see them)
            </label>
            <textarea
              id="alloc-notes"
              className="input min-h-[72px] w-full py-2"
              value={form.notes}
              placeholder="Why, who asked, what they connect"
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              aria-invalid={shown.notes ? true : undefined}
            />
            {shown.notes ? <p className="text-refuse m-0 mt-1 text-[12px]">{shown.notes}</p> : null}
          </div>
          {row?.allocated_at ? (
            <p className="text-ink-3 m-0 text-[12px]">
              Given {formatDate(row.allocated_at)}
              {row.allocated_by?.name || row.allocated_by?.email ? ` by ${row.allocated_by.name ?? row.allocated_by.email}` : ""}
              {row.revoked_at ? ` · taken away ${formatDate(row.revoked_at)}` : ""}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant={taking ? "destructive" : "default"} className={cn(pressable)} disabled={save.isPending}>
              {save.isPending ? <Loader2Icon className="animate-spin" /> : null}
              {taking ? "Take access away" : row ? "Save" : "Give access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsageSheet({ row, onClose }: { row: Allocation | null; onClose: () => void }) {
  const usage = useClubUsage(row?.club.id ?? null);
  const days = (usage.data?.days ?? []).map((d) => ({ date: d.date, total: d.requests, bad: d.errors }));
  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-[620px]">
        <SheetHeader>
          <SheetTitle>{row?.club.name}: API usage</SheetTitle>
          <SheetDescription>Requests from its keys and the partner apps it connected, the last 30 days.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {usage.isPending ? (
            <Skeleton className="h-[140px] rounded-xl" />
          ) : usage.isError ? (
            <Notice tone="refuse" tag="Usage">
              Couldn&apos;t load its figures.
            </Notice>
          ) : days.some((d) => d.total > 0) ? (
            <DailyBars days={days} what="API requests" bad="errors" />
          ) : (
            <p className="text-ink-3 m-0 py-8 text-center text-[12.5px]">No requests in the last 30 days.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
