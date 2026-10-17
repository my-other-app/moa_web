"use client";

import * as React from "react";
import { DownloadIcon, GiftIcon, Trash2Icon } from "lucide-react";
import {
  downloadCsv,
  fetchAllPages,
  formatDateTime,
  formatNumber,
  plural,
  relativeTime,
  timestampedName,
  toCsv,
  type CsvColumn,
} from "@moa/app-kit";
import {
  Button,
  CardLabel,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  IconButton,
  NativeSelect,
  Pager,
  ProgressBar,
  SearchField,
  Segmented,
  Skeleton,
  toast,
  Toolbar,
  ToolbarEnd,
} from "@moa/ui";
import { useDebouncedValue } from "@moa/ui/hooks";

import { LockedNotice } from "@/features/plan";

import { fetchMerchLog } from "../api";
import {
  useAddMerchVariant,
  useDeleteMerchVariant,
  useMerchAnalytics,
  useMerchFields,
  useMerchItems,
  useMerchLog,
  useUpdateMerchItem,
  useUpdateMerchVariant,
} from "../queries";
import type { MerchField, MerchItem, MerchLogRow } from "../schemas";
import {
  label,
  PhotoField,
  RuleFields,
  ruleOf,
  whoOf,
  WHO,
  type Photo,
  type SizeRow,
  type Who,
} from "./swag-fields";
import { SwagTop } from "./swag-top";

/**
 * The Swag tab: the items and their figures (SwagTop), then when things
 * were scanned out and at which door, then every handover — who took what,
 * where, and from whom — with filters and an export. Editing an item is a
 * dialog over the page.
 */
const ROLE: Record<string, string> = {
  attendee: "Attendee",
  speaker: "Speaker",
  staff: "Staff",
};
const ORDER = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
] as const;
const COLS =
  "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_120px_minmax(0,1fr)]";

const COLUMNS: CsvColumn<MerchLogRow>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Ticket", value: (r) => r.ticket_id },
  { header: "Role", value: (r) => ROLE[r.role] ?? r.role },
  { header: "Item", value: (r) => r.item.name },
  { header: "Size", value: (r) => r.variant?.label ?? "" },
  { header: "Door", value: (r) => r.door?.name ?? "" },
  { header: "Handed over", value: (r) => formatDateTime(r.collected_at) },
  { header: "By", value: (r) => r.by.name ?? "" },
];

function EditDialog({
  eventId,
  item,
  fields,
  onClose,
}: {
  eventId: number;
  item: MerchItem;
  fields: MerchField[];
  onClose: () => void;
}) {
  const update = useUpdateMerchItem(eventId);
  const addVariant = useAddMerchVariant(eventId);
  const updateVariant = useUpdateMerchVariant(eventId);
  const removeVariant = useDeleteMerchVariant(eventId);
  const id = React.useId();
  const initial = whoOf(item);
  const [name, setName] = React.useState(item.name);
  const [photo, setPhoto] = React.useState<Photo>({
    key: item.photo_key,
    url: item.photo_url,
  });
  const [stock, setStock] = React.useState(String(item.stock ?? ""));
  const [sponsor, setSponsor] = React.useState(item.sponsor ?? "");
  const [who, setWho] = React.useState<Who>(initial.who);
  const [rule, setRule] = React.useState({
    field: initial.field,
    value: initial.value,
  });
  const [variants, setVariants] = React.useState(
    item.variants.map((v) => ({
      id: v.id,
      label: v.label,
      stock: String(v.stock),
      collected: v.collected,
    })),
  );
  const [fresh, setFresh] = React.useState<SizeRow>({ label: "", stock: "" });
  const [error, setError] = React.useState<string | null>(null);
  const busy =
    update.isPending ||
    addVariant.isPending ||
    updateVariant.isPending ||
    removeVariant.isPending;
  const ruleChanged =
    who !== initial.who ||
    (who === "custom" &&
      (rule.field !== initial.field || rule.value !== initial.value));

  const save = async () => {
    if (!name.trim()) return setError("Name the item.");
    if (who === "custom" && (!rule.field || !rule.value))
      return setError("Pick the field and the answer it must be.");
    setError(null);
    try {
      for (const v of variants) {
        const orig = item.variants.find((x) => x.id === v.id);
        if (
          orig &&
          (orig.label !== v.label.trim() || orig.stock !== Number(v.stock))
        )
          await updateVariant.mutateAsync({
            id: item.id,
            variantId: v.id,
            body: { label: v.label.trim(), stock: Number(v.stock) },
          });
      }
      if (fresh.label.trim())
        await addVariant.mutateAsync({
          id: item.id,
          body: { label: fresh.label.trim(), stock: Number(fresh.stock || 0) },
        });
      await update.mutateAsync({
        id: item.id,
        body: {
          name: name.trim(),
          photo_key: photo.key,
          ...(item.variant_field ? {} : { stock: Number(stock || 0) }),
          sponsor: sponsor.trim() || null,
          ...(ruleChanged ? ruleOf(who, rule.field, rule.value) : {}),
        },
      });
      toast.success(`${name.trim()} saved`);
      onClose();
    } catch {
      /* the mutation says what went wrong */
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit {item.name}</DialogTitle>
          <DialogDescription>
            Stock cannot go below what was already handed out. Renaming a size
            re-matches it against the guest list at the next lookup.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-name`} className={label}>
                Item
              </label>
              <input
                id={`${id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="input"
              />
            </div>
            <div>
              <label htmlFor={`${id}-sponsor`} className={label}>
                Sponsor (optional)
              </label>
              <input
                id={`${id}-sponsor`}
                value={sponsor}
                onChange={(e) => setSponsor(e.target.value)}
                maxLength={120}
                className="input"
              />
            </div>
          </div>
          <PhotoField eventId={eventId} value={photo} onChange={setPhoto} />
          <div className="grid gap-3">
            <div>
              <label htmlFor={`${id}-who`} className={label}>
                Who gets it
              </label>
              <NativeSelect
                id={`${id}-who`}
                value={who}
                onChange={(e) => setWho(e.target.value as Who)}
              >
                {WHO.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {who === "custom" ? (
              <RuleFields
                fields={fields}
                field={rule.field}
                value={rule.value}
                onField={(f) => setRule({ field: f, value: "" })}
                onValue={(v) => setRule((r) => ({ ...r, value: v }))}
              />
            ) : null}
          </div>
          {item.variant_field ? (
            <div className="grid gap-2">
              <span className={label}>Sizes · from “{item.variant_field}”</span>
              {variants.map((v, i) => (
                <div key={v.id} className="flex items-center gap-2">
                  <input
                    value={v.label}
                    onChange={(e) =>
                      setVariants((vs) =>
                        vs.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                    maxLength={40}
                    aria-label="Size"
                    className="input font-mono"
                  />
                  <input
                    value={v.stock}
                    inputMode="numeric"
                    onChange={(e) =>
                      setVariants((vs) =>
                        vs.map((x, j) =>
                          j === i
                            ? { ...x, stock: e.target.value.replace(/\D/g, "") }
                            : x,
                        ),
                      )
                    }
                    aria-label={`Stock of ${v.label}`}
                    className="input w-24 shrink-0 font-mono"
                  />
                  <span className="text-ink-3 w-14 shrink-0 font-mono text-[11px]">
                    {v.collected} out
                  </span>
                  <IconButton
                    label={
                      v.collected > 0
                        ? `${v.label} was handed out; set its stock instead`
                        : `Remove ${v.label}`
                    }
                    danger
                    disabled={v.collected > 0 || busy}
                    onClick={() =>
                      removeVariant.mutate(
                        { id: item.id, variantId: v.id },
                        {
                          onSuccess: () =>
                            setVariants((vs) => vs.filter((x) => x.id !== v.id)),
                        },
                      )
                    }
                  >
                    <Trash2Icon />
                  </IconButton>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  value={fresh.label}
                  onChange={(e) => setFresh((f) => ({ ...f, label: e.target.value }))}
                  placeholder="New size"
                  maxLength={40}
                  aria-label="New size"
                  className="input font-mono"
                />
                <input
                  value={fresh.stock}
                  inputMode="numeric"
                  onChange={(e) =>
                    setFresh((f) => ({
                      ...f,
                      stock: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                  placeholder="0"
                  aria-label="Stock of the new size"
                  className="input w-24 shrink-0 font-mono"
                />
                <span className="w-14 shrink-0" />
                <span className="size-8 shrink-0" />
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor={`${id}-stock`} className={label}>
                Stock · {item.handed_out} handed out
              </label>
              <input
                id={`${id}-stock`}
                value={stock}
                inputMode="numeric"
                onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
                className="input w-32 font-mono"
              />
            </div>
          )}
          {error ? (
            <p role="alert" className="text-refuse text-[12.5px]">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** When things were scanned out, hour by hour, and at which door. Hidden until the first handover. */
function Activity({ eventId }: { eventId: number }) {
  const an = useMerchAnalytics(eventId);
  const a = an.data;
  if (!a || a.handovers === 0) return null;
  const peak = Math.max(1, ...a.by_hour.map((h) => h.count));
  const doors = a.by_door.reduce((n, d) => n + d.count, 0);
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[1.6fr_1fr]">
      <FigurePanel className="p-4">
        <CardLabel
          right={
            <span className="text-ink-3 font-mono text-[11px]">
              {plural(a.handovers, "handover")} · {plural(a.collectors, "guest")}
            </span>
          }
        >
          Scanned out, hour by hour
        </CardLabel>
        <div
          className="mt-3 flex h-[96px] items-end gap-1.5"
          role="img"
          aria-label={`Handovers per hour, busiest ${peak}`}
        >
          {a.by_hour.map((h) => (
            <div
              key={h.hour}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              title={`${h.hour.slice(11, 16)}: ${h.count}`}
            >
              <span className="text-ink-3 font-mono text-[9.5px] tabular-nums">
                {h.count || ""}
              </span>
              <span
                className={cn(
                  "w-full max-w-[40px] rounded-t-[3px]",
                  h.count === peak ? "bg-brand" : "bg-brand-line",
                )}
                style={{ height: `${Math.max(3, (h.count / peak) * 64)}px` }}
              />
            </div>
          ))}
        </div>
        <div className="text-ink-3 mt-1.5 flex gap-1.5 font-mono text-[9.5px]">
          {a.by_hour.map((h) => (
            <span key={h.hour} className="flex-1 text-center">
              {h.hour.slice(11, 16)}
            </span>
          ))}
        </div>
        <p className="text-ink-3 mt-2 text-[11.5px]">
          In the event&apos;s time. Pieces counted by hand are not in this
          chart.
        </p>
      </FigurePanel>
      <FigurePanel className="p-4">
        <CardLabel>By door</CardLabel>
        {a.by_door.length === 0 ? (
          <p className="text-ink-3 mt-3 text-[12.5px]">No door recorded yet.</p>
        ) : (
          <ul className="mt-3 grid gap-2.5">
            {a.by_door.map((d) => (
              <li key={d.id ?? d.name}>
                <div className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="text-ink truncate">{d.name}</span>
                  <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
                    {formatNumber(d.count)} ·{" "}
                    {Math.round((100 * d.count) / Math.max(1, doors))}%
                  </span>
                </div>
                <ProgressBar
                  value={d.count}
                  max={Math.max(1, doors)}
                  className="mt-1"
                  label={`${d.name} handovers`}
                />
              </li>
            ))}
          </ul>
        )}
      </FigurePanel>
    </div>
  );
}

/** Every handover scanned at the gate: who took what, where, and from whom. */
function Handovers({ eventId }: { eventId: number }) {
  const [q, setQ] = React.useState("");
  const settled = useDebouncedValue(q.trim(), 300);
  const [itemId, setItemId] = React.useState<string | undefined>();
  const [variantId, setVariantId] = React.useState<string | undefined>();
  const [doorId, setDoorId] = React.useState<string | undefined>();
  const [by, setBy] = React.useState<number | undefined>();
  const [order, setOrder] = React.useState<"newest" | "oldest">("newest");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [exporting, setExporting] = React.useState(false);
  const query = {
    eventId,
    q: settled || undefined,
    itemId,
    variantId,
    doorId,
    by,
    order,
  };
  const log = useMerchLog({ ...query, page, pageSize });
  const f = log.data?.facets;
  const total = log.data?.total ?? 0;
  const now = new Date(log.dataUpdatedAt || 0);
  const sizes = f?.variants.filter((v) => v.item_id === itemId) ?? [];
  const doors =
    f?.doors.filter((d): d is typeof d & { id: string } => d.id !== null) ?? [];
  const filtered = !!(q.trim() || itemId || doorId || by !== undefined);
  const clear = () => {
    setQ("");
    setItemId(undefined);
    setVariantId(undefined);
    setDoorId(undefined);
    setBy(undefined);
    setPage(1);
  };
  const exportLog = async () => {
    setExporting(true);
    try {
      const { rows, truncated } = await fetchAllPages<MerchLogRow>(
        async (offset, limit) => {
          const res = await fetchMerchLog({
            ...query,
            page: Math.floor(offset / limit) + 1,
            pageSize: limit,
          });
          return { items: res.items, total: res.total };
        },
      );
      downloadCsv(timestampedName(`swag-handovers-${eventId}`), toCsv(rows, COLUMNS));
      if (truncated)
        toast.warning(`The first ${formatNumber(rows.length)} handovers were exported`, {
          description: "Narrow the filters to export the rest.",
        });
      else toast.success(`${plural(rows.length, "handover")} exported`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not export the handovers",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <CardLabel>Who received what</CardLabel>
          <p className="text-ink-3 mt-1 text-[12px] leading-[1.5]">
            {f && f.total
              ? `${plural(f.total, "handover")} scanned at the gate${f.first_at ? `, from ${formatDateTime(f.first_at)}` : ""}${f.last_at && f.total > 1 ? ` to ${formatDateTime(f.last_at)}` : ""}${f.without_door ? ` · ${f.without_door} with no door recorded` : ""}. Pieces counted by hand show on the cards only.`
              : "Every handover scanned at the gate: who took what, where, and who gave it to them."}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void exportLog()}
          disabled={exporting || !f?.total}
        >
          <DownloadIcon /> {exporting ? "Exporting…" : "Export"}
        </Button>
      </div>
      <Toolbar className="mt-1">
        <NativeSelect
          aria-label="Item"
          value={itemId ?? ""}
          onChange={(e) => {
            setItemId(e.target.value || undefined);
            setVariantId(undefined);
            setPage(1);
          }}
          className="w-auto"
          disabled={!f}
        >
          <option value="">Every item</option>
          {f?.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} · {i.count}
            </option>
          ))}
        </NativeSelect>
        {sizes.length ? (
          <NativeSelect
            aria-label="Size"
            value={variantId ?? ""}
            onChange={(e) => {
              setVariantId(e.target.value || undefined);
              setPage(1);
            }}
            className="w-auto"
          >
            <option value="">Every size</option>
            {sizes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} · {v.count}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        {doors.length ? (
          <NativeSelect
            aria-label="Door"
            value={doorId ?? ""}
            onChange={(e) => {
              setDoorId(e.target.value || undefined);
              setPage(1);
            }}
            className="w-auto"
          >
            <option value="">Every door</option>
            {doors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.count}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        {f?.staff.length ? (
          <NativeSelect
            aria-label="Handed over by"
            value={by ?? ""}
            onChange={(e) => {
              setBy(e.target.value ? Number(e.target.value) : undefined);
              setPage(1);
            }}
            className="w-auto"
          >
            <option value="">Anyone</option>
            {f.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? "—"} · {s.count}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <ToolbarEnd>
          <SearchField
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Name, email or ticket"
            label="Search the handovers"
            className="sm:w-56"
          />
          <Segmented
            label="Order"
            value={order}
            options={ORDER}
            onChange={(v) => {
              setOrder(v);
              setPage(1);
            }}
          />
        </ToolbarEnd>
      </Toolbar>

      {log.isPending ? (
        <div className="grid gap-2 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : log.isError ? (
        <EmptyState
          title="Could not load the handovers"
          description="Check the connection, then try again."
          action={
            <Button variant="secondary" onClick={() => void log.refetch()}>
              Try again
            </Button>
          }
        />
      ) : log.data.items.length === 0 ? (
        filtered ? (
          <EmptyState
            size="sm"
            title="Nobody matches"
            description="No handover matches these filters."
            action={
              <Button variant="secondary" size="sm" onClick={clear}>
                Clear the filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<GiftIcon />}
            title="Nothing handed over yet"
            description="Open the gate's Merch tab and find the first guest. Every piece scanned out lands here with who took it, where and from whom."
          />
        )
      ) : (
        <>
          <div className={cn("hidden gap-3 px-4 py-2 sm:grid", COLS)}>
            <span className="eyebrow">Guest</span>
            <span className="eyebrow">Item</span>
            <span className="eyebrow">Door</span>
            <span className="eyebrow">When</span>
            <span className="eyebrow">By</span>
          </div>
          <ul>
            {log.data.items.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "border-line-soft grid grid-cols-1 items-center gap-3 border-t px-4 py-2.5 text-[12.5px]",
                  COLS,
                )}
              >
                <span className="min-w-0">
                  <span className="text-ink block truncate text-[13.5px] font-medium">
                    {r.name}
                  </span>
                  <span className="text-ink-3 block truncate font-mono text-[11px]">
                    {r.ticket_id} · {ROLE[r.role] ?? r.role}
                  </span>
                  <span className="text-ink-2 block truncate text-[12px] sm:hidden">
                    {r.item.name}
                    {r.variant ? ` (${r.variant.label})` : ""}
                    {r.door ? ` · ${r.door.name}` : ""} ·{" "}
                    {formatDateTime(r.collected_at)}
                  </span>
                </span>
                <span className="text-ink-2 hidden min-w-0 items-center gap-1.5 sm:flex">
                  <span className="truncate">{r.item.name}</span>
                  {r.variant ? (
                    <span className="border-line text-ink-2 shrink-0 rounded-full border px-1.5 font-mono text-[10.5px]">
                      {r.variant.label}
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-2 hidden truncate sm:block">
                  {r.door?.name ?? <span className="text-ink-3">Not recorded</span>}
                </span>
                <span
                  className="hidden font-mono tabular-nums sm:block"
                  title={formatDateTime(r.collected_at)}
                >
                  <span className="text-ink block">
                    {formatDateTime(r.collected_at)}
                  </span>
                  <span className="text-ink-3 block text-[11px]">
                    {relativeTime(r.collected_at, now)}
                  </span>
                </span>
                <span className="text-ink-2 hidden truncate sm:block">
                  {r.by.name ?? "—"}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-line-soft border-t px-4 py-2.5">
            <Pager
              page={page}
              pageCount={Math.max(1, Math.ceil(total / pageSize))}
              total={total}
              pageSize={pageSize}
              noun={["handover", "handovers"]}
              busy={log.isFetching}
              onPage={setPage}
              onPageSize={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </div>
        </>
      )}
    </FigurePanel>
  );
}

/** What the event hands out, who may have it, and every handover. */
export function MerchPage({ eventId }: { eventId: number }) {
  const items = useMerchItems(eventId);
  const fields = useMerchFields(eventId);
  const [editing, setEditing] = React.useState<MerchItem | null>(null);
  return (
    <div className="grid gap-5">
      <LockedNotice feature="swag" eventId={eventId} />
      <SwagTop
        eventId={eventId}
        items={items.data ?? []}
        onEdit={setEditing}
        loading={items.isPending}
        error={
          items.isError ? (
            <EmptyState
              tone="muted"
              title="Could not load the swag"
              description="Check the connection, then try again."
              action={
                <Button variant="secondary" onClick={() => void items.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : null
        }
      />
      <Activity eventId={eventId} />
      <Handovers eventId={eventId} />
      {editing ? (
        <EditDialog
          key={editing.id}
          eventId={eventId}
          item={editing}
          fields={fields.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
