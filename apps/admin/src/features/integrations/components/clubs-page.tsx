"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3Icon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { useAllocations, useClubDetail, usePlatformUsage, useRevokeClubKey, useSaveAllocation } from "../queries";
import { ACCESS_FILTERS, DEFAULT_MAX_KEYS, RATE_TIERS, SOURCE_LABEL, TIER_INFO, allocationProblems, byName, tierLabel, type Allocation, type AllocationForm, type ClubKey, type RateTier } from "../schemas";
import { DailyBars, ScopeTags } from "./parts";

const n = (v: number) => v.toLocaleString("en-IN");

/** The columns of the Excel and CSV files: what the list shows, and the notes. */
export const ALLOCATION_COLUMNS: CsvColumn<Allocation>[] = [
  { header: "Club", value: (r) => r.club.name },
  { header: "Club ID", value: (r) => r.club.id },
  { header: "API access", value: (r) => (r.allocated ? "On" : "Off") },
  { header: "Given", value: (r) => (r.source ? (SOURCE_LABEL[r.source] ?? r.source) : "") },
  { header: "Rate tier", value: (r) => tierLabel(r.rate_tier) },
  { header: "Reads a minute", value: (r) => r.rate_limit?.read_per_min ?? TIER_INFO[r.rate_tier as RateTier]?.read ?? "" },
  { header: "Changes a minute", value: (r) => r.rate_limit?.write_per_min ?? TIER_INFO[r.rate_tier as RateTier]?.write ?? "" },
  { header: "Most keys", value: (r) => r.max_keys },
  { header: "Live keys", value: (r) => r.keys_active },
  { header: "Changed", value: (r) => r.updated_at ?? "" },
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
  const manage = useCan("manage_content");
  const canExport = useCan("export_data");
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [detailOf, setDetailOf] = React.useState<Allocation | null>(null);
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
          ) : r.club.verified === false ? (
            <p className="text-caution text-xs">Not approved yet</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "access",
      header: "Access",
      cell: (r) => (
        <div className="flex flex-col items-start gap-0.5">
          <StatusBadge tone={r.allocated ? "success" : "default"} label={r.allocated ? "On" : "Off"} />
          <span className="text-muted-foreground text-[11px]">
            {tierLabel(r.rate_tier)} · {r.keys_active}/{r.max_keys} keys
          </span>
        </div>
      ),
    },
    {
      key: "source",
      header: "Given",
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (r) => <span className="text-muted-foreground text-xs">{r.source ? (SOURCE_LABEL[r.source] ?? r.source) : "--"}</span>,
    },
    {
      key: "updated",
      header: "Changed",
      className: "hidden lg:table-cell",
      headerClassName: "hidden lg:table-cell",
      cell: (r) =>
        r.updated_at ? (
          <time className="text-muted-foreground text-xs" dateTime={r.updated_at} title={formatDateTime(r.updated_at)}>
            {relativeTime(r.updated_at)}
          </time>
        ) : (
          <span className="text-muted-foreground text-xs">--</span>
        ),
    },
    {
      key: "actions",
      header: <span className="block text-right">Action</span>,
      className: "text-right",
      headerClassName: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button size="xs" variant="outline" className={pressable} onClick={() => setDetailOf(r)} aria-label={`Keys and usage of ${r.club.name}`}>
            <BarChart3Icon /> Details
          </Button>
          {manage ? (
            <Button size="xs" variant="outline" className={pressable} onClick={() => setEditing({ club: { id: r.club.id, name: r.club.name }, row: r })} aria-label={`Change ${r.club.name}'s API access`}>
              <PencilIcon /> {r.allocated ? "Change" : "Turn on"}
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
        emptyTitle={status === "revoked" ? "No club has its access off" : "No club has API access yet"}
        emptyDescription={status === "revoked" ? undefined : "Give a club access when it asks to connect its own systems. Nothing is on by default."}
        toolbar={<ListFilters params={params} filters={[{ key: "status", label: "Access", allLabel: "On or off", options: ACCESS_FILTERS.map((f) => ({ value: f.value, label: f.label })) }]} />}
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
      <DetailSheet row={detailOf} manage={manage} onClose={() => setDetailOf(null)} />
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
      { clubId: club.id, clubName: club.name, was: Boolean(row?.allocated), body: { enabled: on, rate_tier: form.tier, max_keys: Number(form.maxKeys), notes: form.notes.trim() || null } },
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
              {row!.club.name}&apos;s API keys and the partner apps it connected are refused from that moment. Nothing is deleted: turning access back on lets the same keys
              work again.
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
          {row?.updated_at ? (
            <p className="text-ink-3 m-0 text-[12px]">
              {row.source ? `${SOURCE_LABEL[row.source] ?? row.source} · ` : ""}last changed {formatDate(row.updated_at)}
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

/** One club's access: 30 days of use, every key (revoked too), and the partner apps it connected. */
function DetailSheet({ row, manage, onClose }: { row: Allocation | null; manage: boolean; onClose: () => void }) {
  const detail = useClubDetail(row?.club.id ?? null);
  const days = (detail.data?.usage ?? []).map((d) => ({ date: d.date, total: d.requests, bad: d.errors }));
  const keys = detail.data?.keys ?? [];
  const apps = detail.data?.connected_apps ?? [];
  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-[620px]">
        <SheetHeader>
          <SheetTitle>{row?.club.name}: API access</SheetTitle>
          <SheetDescription>Requests from its keys and the partner apps it connected, the last 30 days; its keys and apps.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          {detail.isPending ? (
            <Skeleton className="h-[140px] rounded-xl" />
          ) : detail.isError ? (
            <Notice tone="refuse" tag="Club">
              Couldn&apos;t load its access.
            </Notice>
          ) : (
            <>
              {days.some((d) => d.total > 0) ? (
                <DailyBars days={days} what="API requests" bad="errors" />
              ) : (
                <p className="text-ink-3 m-0 py-6 text-center text-[12.5px]">No requests in the last 30 days.</p>
              )}
              <section aria-label="Keys" className="flex flex-col gap-1">
                <CardLabel>Keys · {keys.filter((k) => !k.revoked_at && !k.expired).length} live</CardLabel>
                {keys.length === 0 ? (
                  <p className="text-ink-3 m-0 text-[12.5px]">It hasn&apos;t made a key yet.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col p-0">
                    {keys.map((k) => (
                      <KeyRow key={k.id} k={k} clubId={row!.club.id} manage={manage} />
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="Connected apps" className="flex flex-col gap-1">
                <CardLabel>Connected apps · {apps.length}</CardLabel>
                {apps.length === 0 ? (
                  <p className="text-ink-3 m-0 text-[12.5px]">No partner app is connected to it.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col p-0">
                    {apps.map((c) => (
                      <li key={c.id} className="border-line-soft flex flex-col gap-1 border-b py-2 last:border-0">
                        <span className="text-ink text-[13px] font-medium">{c.app?.name ?? "A partner app"}</span>
                        <ScopeTags scopes={c.scopes} />
                        <span className="text-ink-3 text-[12px]">
                          {c.connected_at ? `Connected ${formatDate(c.connected_at)}` : "Connected"}
                          {byName(c.connected_by) ? ` by ${byName(c.connected_by)}` : ""}
                          {c.last_used_at ? ` · last used ${relativeTime(c.last_used_at)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function KeyRow({ k, clubId, manage }: { k: ClubKey; clubId: number; manage: boolean }) {
  const revoke = useRevokeClubKey(clubId);
  const [asking, setAsking] = React.useState(false);
  const live = !k.revoked_at && !k.expired;
  return (
    <li className="border-line-soft flex flex-col gap-1 border-b py-2 last:border-0" aria-label={k.name}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink text-[13px] font-medium">{k.name}</span>
        <code className="bg-sunken text-ink-2 rounded px-1.5 py-0.5 text-[11px]">{k.prefix}…</code>
        <StatusBadge tone={live ? "success" : "default"} label={k.revoked_at ? "Revoked" : k.expired ? "Expired" : k.mode === "test" ? "Test" : "Live"} />
        <span className="flex-1" />
        {manage && live ? (
          asking ? (
            <span className="flex items-center gap-1.5">
              <Button size="xs" variant="destructive" className={pressable} disabled={revoke.isPending} onClick={() => revoke.mutate(k.id, { onSettled: () => setAsking(false) })}>
                {revoke.isPending ? <Loader2Icon className="animate-spin" /> : null} Revoke it
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setAsking(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <Button size="xs" variant="outline" danger className={pressable} onClick={() => setAsking(true)} aria-label={`Revoke ${k.name}`}>
              <Trash2Icon /> Revoke
            </Button>
          )
        ) : null}
      </div>
      <ScopeTags scopes={k.scopes} />
      <span className="text-ink-3 text-[12px]">
        {k.last_used_at ? `Last used ${relativeTime(k.last_used_at)}` : "Never used"}
        {byName(k.created_by) ? ` · made by ${byName(k.created_by)}` : ""}
        {k.revoked_at ? ` · revoked ${formatDate(k.revoked_at)}` : ""}
      </span>
    </li>
  );
}
