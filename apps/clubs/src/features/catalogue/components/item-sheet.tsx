"use client";

import * as React from "react";
import { ImageIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useObjectUrl } from "@moa/ui/hooks";
import { Button, Chip, IconButton, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Switch, cn } from "@moa/ui";

import { uploadClubItemPhoto } from "../api";
import { useCreateClubItem, useUpdateClubItem } from "../queries";
import { MAX_SIZES, ROLES, catalogueFormSchema, createBody, emptyCatalogueForm, formFromItem, patchBody, photoProblem, type CatalogueDraft, type ClubStoreItem } from "../schemas";

/**
 * Making or changing one item of the club's merchandise, in a sheet: its
 * photo, name, words and price; one stock or a stock per size; who may buy
 * it and who gets it free; and whether it is on sale. The stock is the
 * club's, so every event that offers the item sells from the same pile.
 */
const field = "input h-9 w-full";
const label = "eyebrow mb-1.5 block";

function RoleChips({ value, onChange, allLabel, name }: { value: string[]; onChange: (v: string[]) => void; allLabel: string; name: string }) {
  const toggle = (r: string) => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-1.5">
      <Chip active={value.length === 0} onClick={() => onChange([])}>
        {allLabel}
      </Chip>
      {ROLES.map((r) => (
        <Chip key={r.value} active={value.includes(r.value)} onClick={() => toggle(r.value)}>
          {r.label}
        </Chip>
      ))}
    </div>
  );
}

type Photo = { key: string | null; url: string | null };

/** The photo guests see beside the item when they register, and the door sees when it hands it over. */
function PhotoField({ value, onChange, onBusy }: { value: Photo; onChange: (v: Photo) => void; onBusy: (busy: boolean) => void }) {
  const id = React.useId();
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const local = useObjectUrl(file);
  const preview = local ?? value.url;
  const pick = async (picked: File | undefined) => {
    if (!picked) return;
    const wrong = photoProblem(picked);
    setProblem(wrong);
    if (wrong) return;
    setFile(picked);
    setBusy(true);
    onBusy(true);
    try {
      const up = await uploadClubItemPhoto(picked);
      onChange({ key: up.key, url: up.url });
    } catch (err) {
      setFile(null);
      setProblem(err instanceof Error && err.message ? err.message : "Could not upload that image");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <div className="flex items-start gap-3">
      <div className="bg-sunken text-ink-3 border-line-soft relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Photo preview" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-6" aria-hidden="true" />
        )}
        {busy ? (
          <span className="bg-surface/70 absolute inset-0 grid place-items-center">
            <Loader2Icon className="text-brand size-5 animate-spin" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="grid gap-1.5 pt-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <label htmlFor={id} className="btn btn-secondary btn-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand)]" aria-disabled={busy || undefined}>
            {busy ? "Uploading…" : preview ? "Replace photo" : "Add a photo"}
          </label>
          <input id={id} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Item photo" disabled={busy} onChange={(e) => void pick(e.target.files?.[0])} />
          {preview && !busy ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              danger
              onClick={() => {
                setFile(null);
                onChange({ key: null, url: null });
              }}
            >
              Remove photo
            </Button>
          ) : null}
        </span>
        <span className="text-ink-3 text-[11.5px]">PNG, JPEG or WebP, up to 5 MB. Shown at registration and at the door.</span>
        {problem ? (
          <span role="alert" className="text-refuse text-[12px]">
            {problem}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SizesEditor({ rows, onRows, item, errorOf }: { rows: CatalogueDraft["sizes"]; onRows: (rows: CatalogueDraft["sizes"]) => void; item: ClubStoreItem | null; errorOf: (path: string) => string | undefined }) {
  const before = (text: string) => item?.variants.find((v) => v.label.toLowerCase() === text.trim().toLowerCase());
  const change = (i: number, patch: Partial<CatalogueDraft["sizes"][number]>) => onRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="grid gap-2">
      <div aria-hidden="true" className="text-ink-3 grid grid-cols-[1fr_110px_32px] gap-2 text-[11.5px]">
        <span>Size</span>
        <span>Stock</span>
        <span />
      </div>
      {rows.map((row, i) => {
        const was = before(row.label);
        const name = row.label.trim() || `${i + 1}`;
        return (
          <div key={i} className="grid grid-cols-[1fr_110px_32px] items-start gap-2">
            <div>
              <input className={field} aria-label={`Size ${i + 1}`} placeholder="e.g. M" value={row.label} maxLength={40} onChange={(e) => change(i, { label: e.target.value })} aria-invalid={!!errorOf(`sizes.${i}.label`)} />
              {errorOf(`sizes.${i}.label`) ? <p className="text-refuse mt-1 text-[12px]">{errorOf(`sizes.${i}.label`)}</p> : null}
            </div>
            <div>
              <input className={cn(field, "font-mono")} inputMode="numeric" aria-label={`Stock of size ${name}`} value={row.stock} onChange={(e) => change(i, { stock: e.target.value })} aria-invalid={!!errorOf(`sizes.${i}.stock`)} />
              {errorOf(`sizes.${i}.stock`) ? (
                <p className="text-refuse mt-1 text-[12px]">{errorOf(`sizes.${i}.stock`)}</p>
              ) : was && was.sold + was.held > 0 ? (
                <p className="text-ink-3 mt-1 text-[11.5px]">
                  {was.sold} sold{was.held ? `, ${was.held} held` : ""}
                </p>
              ) : null}
            </div>
            <IconButton variant="ghost" size="sm" danger label={`Remove size ${name}`} onClick={() => onRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>
              <Trash2Icon className="size-3.5" />
            </IconButton>
          </div>
        );
      })}
      {rows.length < MAX_SIZES ? (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onRows([...rows, { label: "", stock: "" }])}>
            <PlusIcon className="size-3.5" /> Add a size
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The sheet's insides. Mounted each time the sheet opens, so every opening starts from the item as saved. */
function ItemForm({ item, onClose, onDelete }: { item: ClubStoreItem | null; onClose: () => void; onDelete?: (item: ClubStoreItem) => void }) {
  const id = React.useId();
  const create = useCreateClubItem();
  const update = useUpdateClubItem();
  const [draft, setDraft] = React.useState<CatalogueDraft>(() => (item ? formFromItem(item) : emptyCatalogueForm));
  const [photo, setPhoto] = React.useState<Photo>({ key: item?.photo_key ?? null, url: item?.photo_url ?? null });
  const [uploading, setUploading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = <K extends keyof CatalogueDraft>(k: K, v: CatalogueDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const err = (path: string) => (errors[path] ? <p className="text-refuse mt-1 text-[12px]">{errors[path]}</p> : null);
  const saving = create.isPending || update.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = catalogueFormSchema.safeParse({ ...draft, photo_key: photo.key });
    if (!parsed.success) {
      // The first problem with each field is the one worth saying.
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[i.path.join(".") || "form"] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      if (item) {
        const patch = patchBody(item, parsed.data);
        if (Object.keys(patch).length > 0) await update.mutateAsync({ id: item.id, patch });
      } else {
        await create.mutateAsync(createBody(parsed.data));
      }
      onClose();
    } catch {
      /* the mutation says what went wrong */
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex h-full min-h-0 flex-col">
      <SheetHeader className="border-line-soft border-b px-5 py-4">
        <SheetTitle className="text-ink text-[16px]">{item ? `Edit ${item.name}` : "New item"}</SheetTitle>
        <SheetDescription className="text-ink-3 text-[12.5px]">
          {item
            ? item.events.length > 0
              ? `Changes show on the ${item.events.length === 1 ? "event" : `${item.events.length} events`} offering it, which share its stock.`
              : "Not on an event yet. Offer it from an event's form or its Merchandise tab."
            : "Made once for the club. Offer it on any event; every event sells from the same stock."}
        </SheetDescription>
      </SheetHeader>

      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 py-4">
        <PhotoField value={photo} onChange={setPhoto} onBusy={setUploading} />

        <div>
          <label htmlFor={`${id}-name`} className={label}>
            Name
          </label>
          <input id={`${id}-name`} className={field} placeholder="e.g. Hack Night hoodie" value={draft.name} maxLength={120} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
          {err("name")}
        </div>

        <div>
          <label htmlFor={`${id}-description`} className={label}>
            Description (optional)
          </label>
          <textarea id={`${id}-description`} className="input min-h-[72px] w-full py-2" placeholder="Heavyweight cotton, screen-printed. Collect it at the door." value={draft.description} maxLength={300} onChange={(e) => set("description", e.target.value)} aria-invalid={!!errors.description} />
          <div className="text-ink-3 mt-1 flex justify-between gap-3 text-[11.5px]">
            {errors.description ? <span className="text-refuse">{errors.description}</span> : <span>Shown under the name at registration.</span>}
            <span className="tabular-nums">{draft.description.length}/300</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-price`} className={label}>
              Price (₹)
            </label>
            <input id={`${id}-price`} className={cn(field, "font-mono")} inputMode="decimal" placeholder="450" value={draft.price} onChange={(e) => set("price", e.target.value)} aria-invalid={!!errors.price} />
            {err("price")}
          </div>
          {!draft.sized ? (
            <div>
              <label htmlFor={`${id}-stock`} className={label}>
                Stock
              </label>
              <input id={`${id}-stock`} className={cn(field, "font-mono")} inputMode="numeric" placeholder="100" value={draft.stock} onChange={(e) => set("stock", e.target.value)} aria-invalid={!!errors.stock} />
              {err("stock")}
              {item && item.variants.length === 0 && item.sold + item.held > 0 ? (
                <p className="text-ink-3 mt-1 text-[11.5px]">
                  {item.sold} sold across events{item.held ? `, ${item.held} held` : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="border-line-soft grid gap-3 rounded-xl border p-3">
          <div className="flex items-start gap-3">
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[13px] font-medium">Comes in sizes</span>
              <span className="text-ink-3 block text-[11.5px]">Each size keeps its own stock, and guests pick one when they register.</span>
            </span>
            <Switch checked={draft.sized} aria-label="Comes in sizes" onCheckedChange={(on) => set("sized", on)} className="mt-0.5" />
          </div>
          {draft.sized ? (
            <div>
              <SizesEditor rows={draft.sizes} onRows={(rows) => set("sizes", rows)} item={item} errorOf={(path) => errors[path]} />
              {err("sizes")}
            </div>
          ) : null}
        </div>

        <div>
          <span className={label}>Who can buy it</span>
          <RoleChips name="Who can buy it" value={draft.available_roles} onChange={(v) => set("available_roles", v)} allLabel="Everyone" />
        </div>
        <div>
          <span className={label}>Who gets it free</span>
          <RoleChips name="Who gets it free" value={draft.free_roles} onChange={(v) => set("free_roles", v)} allLabel="Nobody" />
        </div>

        <div className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="text-ink block text-[13px] font-medium">On sale</span>
            <span className="text-ink-3 block text-[11.5px]">Off, it stays on its events but is not offered at registration.</span>
          </span>
          <Switch checked={draft.on_sale} aria-label="On sale" onCheckedChange={(on) => set("on_sale", on)} className="mt-0.5" />
        </div>
      </div>

      <SheetFooter className="border-line-soft flex-row flex-wrap items-center gap-2 border-t px-5 py-3">
        {item && onDelete ? (
          <Button type="button" variant="ghost" danger onClick={() => onDelete(item)}>
            <Trash2Icon className="size-4" /> Delete
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || uploading}>
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {item ? "Save changes" : "Add item"}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function ItemSheet({ open, onOpenChange, item, onDelete }: { open: boolean; onOpenChange: (open: boolean) => void; item: ClubStoreItem | null; onDelete?: (item: ClubStoreItem) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-surface w-full gap-0 p-0 sm:max-w-[520px]">
        {open ? <ItemForm key={item?.id ?? "new"} item={item} onClose={() => onOpenChange(false)} onDelete={onDelete} /> : null}
      </SheetContent>
    </Sheet>
  );
}
