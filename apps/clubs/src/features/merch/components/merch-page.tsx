"use client";

import * as React from "react";
import Link from "next/link";
import { DoorOpenIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { PageHeader, formatDateTime } from "@moa/app-kit";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState, Pager, Skeleton, cn, toast } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useEventDetail } from "@/features/events";

import { uploadMerchPhoto } from "../api";
import { useAddMerchVariant, useCreateMerchItem, useDeleteMerchItem, useDeleteMerchVariant, useMerchAnalytics, useMerchFields, useMerchItems, useMerchLog, useUpdateMerchItem, useUpdateMerchVariant } from "../queries";
import type { MerchField, MerchItem, MerchItemInput } from "../schemas";

const panel = "rounded-2xl bg-card ring-1 ring-border/70 shadow-sm";
const heading = "font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const note = "text-[12px] leading-[1.5] text-muted-foreground";
const control = "h-9 w-full rounded-md border bg-muted/40 px-2.5 text-[13px]";
const chip = (on: boolean) => cn("rounded-full border px-2.5 py-1 text-[12px] transition-colors", on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted");
const ROLE: Record<string, string> = { attendee: "Attendee", speaker: "Speaker", staff: "Staff" };

function Bar({ value, max, tone = "primary" }: { value: number; max: number; tone?: "primary" | "destructive" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cn("h-full rounded-full", tone === "destructive" ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className={cn(panel, "p-4")}>
      <p className={heading}>{label}</p>
      <p className="mt-1 text-2xl font-medium tabular-nums">{value}</p>
      <p className={note}>{sub}</p>
    </div>
  );
}

const eligibilityNote = (m: MerchItem) => (m.eligibility_field ? `${m.eligibility_field} = ${m.eligibility_value}` : "Everyone");

function PhotoField({ eventId, value, url, onChange }: { eventId: number; value: string | null; url: string | null; onChange: (v: { key: string | null; url: string | null }) => void }) {
  const [busy, setBusy] = React.useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadMerchPhoto(eventId, file);
      onChange({ key: up.key, url: up.url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload that image");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-14 rounded-md border object-cover" />
      ) : (
        <span aria-hidden className="size-14 rounded-md border bg-muted" />
      )}
      <div className="space-y-1">
        <label className={cn("inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1.5 text-[12.5px] hover:bg-muted", busy && "opacity-50")}>
          {busy ? "Uploading…" : value ? "Replace photo" : "Add a photo"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        {value ? (
          <button type="button" className="block text-[12px] text-muted-foreground underline" onClick={() => onChange({ key: null, url: null })}>
            Remove
          </button>
        ) : (
          <p className={note}>Optional. Shown at the gate so the right thing is handed over.</p>
        )}
      </div>
    </div>
  );
}

/** Field + value pickers for an eligibility rule: a list field offers its values, a text field takes anything. */
function RuleFields({ fields, field, value, onField, onValue }: { fields: MerchField[]; field: string; value: string; onField: (v: string) => void; onValue: (v: string) => void }) {
  const chosen = fields.find((f) => f.name.toLowerCase() === field.toLowerCase());
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="space-y-1 text-[12px]">
        Field
        <select value={field} onChange={(e) => (onField(e.target.value), onValue(""))} className={control}>
          <option value="">Everyone</option>
          {fields.map((f) => (
            <option key={f.key} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-[12px]">
        Must equal
        {chosen && chosen.values.length ? (
          <select value={value} onChange={(e) => onValue(e.target.value)} disabled={!field} className={control}>
            <option value="">Pick a value</option>
            {chosen.values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <input value={value} onChange={(e) => onValue(e.target.value)} placeholder="VIP" disabled={!field} maxLength={80} className={control} />
        )}
      </label>
    </div>
  );
}

type VariantRow = { label: string; stock: string };

function NewItemForm({ eventId, fields }: { eventId: number; fields: MerchField[] }) {
  const create = useCreateMerchItem(eventId);
  const [name, setName] = React.useState("");
  const [photo, setPhoto] = React.useState<{ key: string | null; url: string | null }>({ key: null, url: null });
  const [stock, setStock] = React.useState("100");
  const [sized, setSized] = React.useState(false);
  const [variantField, setVariantField] = React.useState("");
  const [rows, setRows] = React.useState<VariantRow[]>([]);
  const [eligField, setEligField] = React.useState("");
  const [eligValue, setEligValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const sizeFields = fields.filter((f) => f.kind !== "role");
  const fillFrom = (fname: string) => {
    setVariantField(fname);
    const f = fields.find((x) => x.name === fname);
    setRows(f?.values.length ? f.values.map((v) => ({ label: v, stock: "" })) : [{ label: "", stock: "" }]);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Name the item.");
    if (sized && !variantField) return setError("Which guest field holds the size?");
    const variants = rows.map((r) => ({ label: r.label.trim(), stock: Number(r.stock || 0) })).filter((r) => r.label);
    if (sized && variants.length === 0) return setError("Add at least one size.");
    if (!sized && stock.trim() === "") return setError("Required, because this item has no variants.");
    if (!!eligField !== !!eligValue) return setError("Set both the field and the value, or neither.");
    setError(null);
    const body: MerchItemInput = {
      name: name.trim(),
      photo_key: photo.key,
      stock: sized ? null : Number(stock),
      variant_field: sized ? variantField : null,
      variants: sized ? variants : [],
      eligibility_field: eligField || null,
      eligibility_value: eligValue || null,
    };
    create.mutate(body, {
      onSuccess: (item) => {
        toast.success(`${item.name} added`, { description: sized ? `${item.variants.length} sizes, ${item.total} in all.` : `${item.total} in stock.` });
        setName("");
        setPhoto({ key: null, url: null });
        setRows([]);
        setVariantField("");
        setSized(false);
        setEligField("");
        setEligValue("");
      },
    });
  };
  return (
    <form onSubmit={submit} className={cn(panel, "space-y-3 p-4")}>
      <p className={heading}>New item</p>
      <label className="block space-y-1 text-[12px]">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Summit tote" maxLength={120} className={control} />
      </label>
      <PhotoField eventId={eventId} value={photo.key} url={photo.url} onChange={setPhoto} />
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={sized} onChange={(e) => (setSized(e.target.checked), e.target.checked && !variantField && sizeFields[0] ? fillFrom(sizeFields[0].name) : undefined)} className="mt-0.5 size-4 accent-primary" />
        <span>
          <span className="block text-[13px]">Give people different sizes</span>
          <span className={note}>Each size keeps its own stock. The size a guest gets comes from a field on their record.</span>
        </span>
      </label>
      {sized ? (
        <>
          <label className="block space-y-1 text-[12px]">
            Which guest field holds the size?
            <select value={variantField} onChange={(e) => fillFrom(e.target.value)} className={control}>
              <option value="">Pick a field</option>
              {sizeFields.map((f) => (
                <option key={f.key} value={f.name}>
                  {f.name}
                  {f.values.length ? ` · ${f.values.join(", ")}` : ""}
                </option>
              ))}
            </select>
          </label>
          {sizeFields.length === 0 ? <p className={cn(note, "text-amber-700 dark:text-amber-300")}>The event has no guest fields yet. Add one (a list, like “T-shirt size”) on the event&apos;s edit page first.</p> : null}
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={r.label} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="L" maxLength={40} aria-label="Variant label" className={cn(control, "font-mono")} />
                <input value={r.stock} inputMode="numeric" onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, stock: e.target.value.replace(/\D/g, "") } : x)))} placeholder="60" aria-label="Variant stock" className={cn(control, "w-24 font-mono")} />
                <Button type="button" size="icon-xs" variant="ghost" aria-label="Remove variant" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, { label: "", stock: "" }])}>
              <PlusIcon /> Another size
            </Button>
          </div>
        </>
      ) : (
        <label className="block space-y-1 text-[12px]">
          Stock
          <input value={stock} inputMode="numeric" onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))} className={cn(control, "w-32 font-mono")} />
        </label>
      )}
      <div>
        <p className={heading}>Who is eligible</p>
        <p className={cn(note, "mb-2")}>By role, or by a guest field: “Role = Speaker”, or “Pass = VIP”. Resolved from the guest&apos;s own record at the gate.</p>
        <RuleFields fields={fields} field={eligField} value={eligValue} onField={setEligField} onValue={setEligValue} />
      </div>
      {error ? <p className="text-[12.5px] text-destructive">{error}</p> : null}
      <Button type="submit" disabled={create.isPending} className={cn("w-full", pressable)}>
        <PlusIcon /> Add item
      </Button>
    </form>
  );
}

function EditDialog({ eventId, item, fields, onClose }: { eventId: number; item: MerchItem; fields: MerchField[]; onClose: () => void }) {
  const update = useUpdateMerchItem(eventId);
  const addVariant = useAddMerchVariant(eventId);
  const updateVariant = useUpdateMerchVariant(eventId);
  const removeVariant = useDeleteMerchVariant(eventId);
  const [name, setName] = React.useState(item.name);
  const [photo, setPhoto] = React.useState<{ key: string | null; url: string | null }>({ key: item.photo_key, url: item.photo_url });
  const [stock, setStock] = React.useState(String(item.stock ?? ""));
  const [eligField, setEligField] = React.useState(item.eligibility_field ?? "");
  const [eligValue, setEligValue] = React.useState(item.eligibility_value ?? "");
  const [variants, setVariants] = React.useState(item.variants.map((v) => ({ id: v.id, label: v.label, stock: String(v.stock), collected: v.collected })));
  const [fresh, setFresh] = React.useState<VariantRow>({ label: "", stock: "" });
  const busy = update.isPending || addVariant.isPending || updateVariant.isPending || removeVariant.isPending;
  const save = async () => {
    try {
      for (const v of variants) {
        const orig = item.variants.find((x) => x.id === v.id);
        if (orig && (orig.label !== v.label.trim() || orig.stock !== Number(v.stock))) await updateVariant.mutateAsync({ id: item.id, variantId: v.id, body: { label: v.label.trim(), stock: Number(v.stock) } });
      }
      if (fresh.label.trim()) await addVariant.mutateAsync({ id: item.id, body: { label: fresh.label.trim(), stock: Number(fresh.stock || 0) } });
      await update.mutateAsync({ id: item.id, body: { name: name.trim(), photo_key: photo.key, ...(item.variant_field ? {} : { stock: Number(stock || 0) }), eligibility_field: eligField || null, eligibility_value: eligValue || null } });
      toast.success("Item saved");
      onClose();
    } catch {
      /* the mutation toasts */
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {item.name}</DialogTitle>
          <DialogDescription>Stock cannot go below what was already handed out. Renaming a size re-matches it against the guest list at the next lookup.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-[12px]">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={control} />
          </label>
          <PhotoField eventId={eventId} value={photo.key} url={photo.url} onChange={setPhoto} />
          {item.variant_field ? (
            <div className="space-y-1.5">
              <p className={heading}>Sizes · from “{item.variant_field}”</p>
              {variants.map((v, i) => (
                <div key={v.id} className="flex items-center gap-1.5">
                  <input value={v.label} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} maxLength={40} aria-label="Variant label" className={cn(control, "font-mono")} />
                  <input value={v.stock} inputMode="numeric" onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, stock: e.target.value.replace(/\D/g, "") } : x)))} aria-label="Variant stock" className={cn(control, "w-24 font-mono")} />
                  <span className="w-16 shrink-0 font-mono text-[10.5px] text-muted-foreground">{v.collected} out</span>
                  <Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${v.label}`} disabled={v.collected > 0 || busy} title={v.collected > 0 ? "Handed out already; set its stock instead" : undefined} onClick={() => removeVariant.mutate({ id: item.id, variantId: v.id }, { onSuccess: () => setVariants((vs) => vs.filter((x) => x.id !== v.id)) })}>
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <input value={fresh.label} onChange={(e) => setFresh((f) => ({ ...f, label: e.target.value }))} placeholder="New size" maxLength={40} aria-label="New variant label" className={cn(control, "font-mono")} />
                <input value={fresh.stock} inputMode="numeric" onChange={(e) => setFresh((f) => ({ ...f, stock: e.target.value.replace(/\D/g, "") }))} placeholder="0" aria-label="New variant stock" className={cn(control, "w-24 font-mono")} />
                <span className="w-16 shrink-0" />
                <span className="size-6 shrink-0" />
              </div>
            </div>
          ) : (
            <label className="block space-y-1 text-[12px]">
              Stock <span className="text-muted-foreground">({item.collected} handed out)</span>
              <input value={stock} inputMode="numeric" onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))} className={cn(control, "w-32 font-mono")} />
            </label>
          )}
          <div>
            <p className={cn(heading, "mb-2")}>Who is eligible</p>
            <RuleFields fields={fields} field={eligField} value={eligValue} onField={setEligField} onValue={setEligValue} />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={busy} className="flex-1">
              Save
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({ eventId, item, onEdit }: { eventId: number; item: MerchItem; onEdit: () => void }) {
  const remove = useDeleteMerchItem(eventId);
  const [confirm, setConfirm] = React.useState(false);
  return (
    <li className="flex gap-3.5 px-4 py-3">
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo_url} alt="" className="size-12 shrink-0 rounded-md border object-cover" />
      ) : (
        <span aria-hidden className="size-12 shrink-0 rounded-md border bg-muted" />
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13.5px] font-medium">{item.name}</span>
          <span className="font-mono text-[10.5px] uppercase text-muted-foreground">{eligibilityNote(item)}</span>
        </div>
        {item.variant_field ? (
          <div className="flex flex-wrap gap-1.5">
            {item.variants.map((v) => (
              <span key={v.id} className={cn("rounded-full border px-2 py-0.5 font-mono text-[10.5px]", v.collected >= v.stock ? "border-destructive/50 text-destructive" : "")}>
                {v.label} {v.collected}/{v.stock}
              </span>
            ))}
            <span className="font-mono text-[10.5px] text-muted-foreground">by {item.variant_field}</span>
          </div>
        ) : (
          <div className="max-w-xs space-y-1">
            <Bar value={item.collected} max={item.total} tone={item.total > 0 && item.collected >= item.total ? "destructive" : "primary"} />
            <p className="font-mono text-[10.5px] text-muted-foreground">
              {item.collected} of {item.total} handed out
            </p>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-0.5">
        <Button size="icon-xs" variant="ghost" aria-label={`Edit ${item.name}`} onClick={onEdit}>
          <PencilIcon />
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label={`Remove ${item.name}`} onClick={() => setConfirm(true)}>
          <Trash2Icon />
        </Button>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {item.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {item.collected > 0 ? `${item.collected} have already been handed out. Removing the item removes the record of those handovers too; the guests keep what they were given.` : "Nobody has collected it. It simply goes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate({ id: item.id, withCollections: item.collected > 0 })}>{item.collected > 0 ? "Remove with its handovers" : "Remove"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function Handovers({ eventId }: { eventId: number }) {
  const [q, setQ] = React.useState("");
  const [settled, setSettled] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setSettled(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const [itemId, setItemId] = React.useState<string | undefined>();
  const [doorId, setDoorId] = React.useState<string | undefined>();
  const [by, setBy] = React.useState<number | undefined>();
  const [order, setOrder] = React.useState<"newest" | "oldest">("newest");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const log = useMerchLog({ eventId, q: settled || undefined, itemId, doorId, by, order, page, pageSize });
  const f = log.data?.facets;
  const total = log.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const reset = () => setPage(1);
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[15px] font-medium text-foreground">Handovers</p>
        <p className={note}>{f ? `${f.total} handed over${f.first_at ? `, from ${formatDateTime(f.first_at)}` : ""}${f.last_at && f.total > 1 ? ` to ${formatDateTime(f.last_at)}` : ""}${f.without_door ? ` · ${f.without_door} with no door recorded` : ""}.` : "Every handover: who took what, where, and who gave it to them."}</p>
      </div>
      {f && f.total > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Items">
            <button type="button" className={chip(itemId === undefined)} onClick={() => (setItemId(undefined), reset())}>
              Every item
            </button>
            {f.items.map((i) => (
              <button key={i.id} type="button" className={chip(itemId === i.id)} onClick={() => (setItemId(i.id), reset())}>
                {i.name} <span className="font-mono text-[10px] opacity-70">{i.count}</span>
              </button>
            ))}
          </div>
          {f.doors.length ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Doors">
              <button type="button" className={chip(doorId === undefined)} onClick={() => (setDoorId(undefined), reset())}>
                Every door
              </button>
              {f.doors.map((d) => (
                <button key={d.id ?? d.name} type="button" className={chip(doorId === d.id)} disabled={d.id === null} onClick={() => (setDoorId(d.id ?? undefined), reset())}>
                  {d.name} <span className="font-mono text-[10px] opacity-70">{d.count}</span>
                </button>
              ))}
            </div>
          ) : null}
          {f.staff.length ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="By whom">
              <button type="button" className={chip(by === undefined)} onClick={() => (setBy(undefined), reset())}>
                Anyone
              </button>
              {f.staff.map((s) => (
                <button key={s.id} type="button" className={chip(by === s.id)} onClick={() => (setBy(s.id), reset())}>
                  {s.name ?? "—"} <span className="font-mono text-[10px] opacity-70">{s.count}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => (setQ(e.target.value), reset())} placeholder="Search name, email or ticket" aria-label="Search the handovers" className="h-9 w-64 rounded-md border bg-transparent px-3 text-sm" />
        <span className="flex-1" />
        <button type="button" className={chip(false)} onClick={() => (setOrder((o) => (o === "newest" ? "oldest" : "newest")), reset())}>
          {order === "newest" ? "Newest first" : "Oldest first"}
        </button>
      </div>
      {log.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : log.isError ? (
        <EmptyState tone="muted" title="Could not load the handovers" description={log.error.message} />
      ) : !log.data.items.length ? (
        <EmptyState tone="muted" title={f?.total ? "Nobody matches" : "Nothing handed over yet"} description={f?.total ? "Try a wider filter." : "Open the gate's Merch tab and find the first guest."} />
      ) : (
        <div className={cn(panel, "overflow-hidden")}>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Guest</th>
                <th className="px-4 py-3 text-left font-medium">Item</th>
                <th className="px-4 py-3 text-left font-medium">Door</th>
                <th className="px-4 py-3 text-left font-medium">When</th>
                <th className="px-4 py-3 text-left font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {log.data.items.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium">{r.name}</div>
                    <div className="font-mono text-[10.5px] text-muted-foreground">
                      {r.ticket_id} · {ROLE[r.role] ?? r.role}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {r.item.name}
                    {r.variant ? <span className="ml-1.5 rounded-full border px-1.5 font-mono text-[10px]">{r.variant.label}</span> : null}
                  </td>
                  <td className="px-4 py-3 align-top">{r.door?.name ?? <span className="text-muted-foreground">Not recorded</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 align-top">{formatDateTime(r.collected_at)}</td>
                  <td className="px-4 py-3 align-top">{r.by.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 0 ? (
            <div className="border-t border-border/60 px-4 py-2.5">
              <Pager page={page} pageCount={pages} total={total} pageSize={pageSize} noun={["handover", "handovers"]} busy={log.isFetching} onPage={setPage} onPageSize={(n) => (setPageSize(n), setPage(1))} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Counts({ eventId }: { eventId: number }) {
  const an = useMerchAnalytics(eventId);
  if (!an.data) return null;
  const a = an.data;
  const peak = Math.max(1, ...a.by_hour.map((h) => h.count));
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
      <section className={cn(panel, "space-y-3 p-4")}>
        <p className={heading}>By item</p>
        {a.by_item.length === 0 ? <p className={note}>No items yet.</p> : null}
        {a.by_item.map((i) => (
          <div key={i.id} className="space-y-1">
            <div className="flex justify-between text-[13px]">
              <span>{i.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {i.collected}
                {i.stock != null ? ` / ${i.stock}` : i.variants.length ? ` / ${i.variants.reduce((n, v) => n + (v.stock ?? 0), 0)}` : ""}
              </span>
            </div>
            <Bar value={i.collected} max={i.stock ?? i.variants.reduce((n, v) => n + (v.stock ?? 0), 0)} />
            {i.variants.length ? (
              <div className="flex flex-wrap gap-1">
                {i.variants.map((v) => (
                  <span key={v.id} className="rounded-full border px-1.5 font-mono text-[10px] text-muted-foreground">
                    {v.label} {v.collected}/{v.stock ?? "—"}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </section>
      <div className="space-y-3">
        <section className={cn(panel, "space-y-2 p-4")}>
          <p className={heading}>By door</p>
          {a.by_door.length === 0 ? <p className={note}>Nothing handed over yet.</p> : null}
          {a.by_door.map((d) => (
            <div key={d.id ?? d.name} className="flex justify-between text-[13px]">
              <span>{d.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{d.count}</span>
            </div>
          ))}
        </section>
        <section className={cn(panel, "space-y-2 p-4")}>
          <p className={heading}>By hour · event time</p>
          {a.by_hour.length === 0 ? <p className={note}>Nothing handed over yet.</p> : null}
          {a.by_hour.map((h) => (
            <div key={h.hour} className="flex items-center gap-2 text-[12px]">
              <span className="w-12 shrink-0 font-mono text-muted-foreground">{h.hour.slice(11, 16)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((h.count / peak) * 100)}%` }} />
              </div>
              <span className="w-8 text-right font-mono text-muted-foreground">{h.count}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

/** What the event hands out, who may have it, and every handover. */
export function MerchPage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const items = useMerchItems(eventId);
  const fields = useMerchFields(eventId);
  const an = useMerchAnalytics(eventId);
  const [editing, setEditing] = React.useState<MerchItem | null>(null);
  const totalStock = items.data?.reduce((n, i) => n + i.total, 0) ?? 0;
  const totalOut = items.data?.reduce((n, i) => n + i.collected, 0) ?? 0;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Merchandise"
        description="What the event hands out, who may have it, and every handover. Volunteers with the merch duty find the guest at the gate and see exactly what they are owed."
        action={
          <Button asChild className={pressable}>
            <Link href={`/gate/${eventId}`} target="_blank" rel="noopener">
              <DoorOpenIcon /> Open the gate
            </Link>
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Handed out" value={totalOut} sub={`of ${totalStock} in stock`} />
        <Tile label="Guests served" value={an.data?.collectors ?? "—"} sub="collected at least one thing" />
        <Tile label="Items" value={items.data?.length ?? "—"} sub="set up for this event" />
      </div>
      {items.isPending || fields.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : items.isError ? (
        <EmptyState tone="muted" title="Could not load the items" description={items.error.message} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className={panel}>
            <div className="px-4 pt-4">
              <p className={heading}>Items</p>
              <p className={note}>Each keeps its own stock, or sizes with a stock each. Stock counts down as things are handed over.</p>
            </div>
            {items.data.length === 0 ? (
              <div className="p-4">
                <EmptyState tone="muted" title="Nothing to hand out yet" description="Add the first item on the right: a tote, a tee with sizes, a speaker gift." />
              </div>
            ) : (
              <ul className="mt-2 divide-y">
                {items.data.map((i) => (
                  <ItemRow key={i.id} eventId={eventId} item={i} onEdit={() => setEditing(i)} />
                ))}
              </ul>
            )}
          </section>
          <NewItemForm eventId={eventId} fields={fields.data ?? []} />
        </div>
      )}
      <Counts eventId={eventId} />
      <Handovers eventId={eventId} />
      {editing ? <EditDialog key={editing.id} eventId={eventId} item={editing} fields={fields.data ?? []} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
