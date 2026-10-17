"use client";

import * as React from "react";
import { LockIcon, PackageIcon, PencilIcon, PlusIcon, ShirtIcon, Trash2Icon, XIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { CardLabel, Chip, EmptyState, FigurePanel, Pager, ProgressBar, Skeleton, StatTile, cn } from "@moa/ui";

import { useEventDetail } from "@/features/events";
import { LimitMeter, LockedNotice, useFeatureGate, useLimitGate } from "@/features/plan";

import { useCreateStoreItem, useDeleteStoreItem, useHandOver, useStoreItems, useStoreOrders, useStoreSettings, useStoreSummary, useUpdateStoreItem } from "../queries";
import { ROLES, audienceLine, itemFormSchema, type StoreItem, type StoreSummary } from "../schemas";

/**
 * Merchandise: what the event sells with its tickets.
 *
 * Four figures, the switch that puts the shelf on the registration page,
 * the shelf itself (each item with what it sold, what is left, what it
 * earned, and whether it is on sale), the sizes of the best seller for the
 * next print run, and the orders with who still has to collect theirs.
 */
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const field = "input h-9 w-full";
const label = "eyebrow mb-1.5 block";

function RoleChips({ value, onChange, allLabel }: { value: string[]; onChange: (v: string[]) => void; allLabel: string }) {
  const toggle = (r: string) => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  return (
    <div className="flex flex-wrap gap-1.5">
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

function NewItem({ eventId, onClose }: { eventId: number; onClose: () => void }) {
  const create = useCreateStoreItem(eventId);
  const [draft, setDraft] = React.useState({ name: "", price: "", stock: "", variants: "", available_roles: [] as string[], free_roles: [] as string[] });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = (k: "name" | "price" | "stock" | "variants") => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = itemFormSchema.safeParse(draft);
    if (!parsed.success) return void setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message])));
    setErrors({});
    await create.mutateAsync(parsed.data);
    onClose();
  };
  const sized = draft.variants.trim().length > 0;
  return (
    <FigurePanel className="border-brand-line p-4">
      <form onSubmit={submit} noValidate>
        <CardLabel>New item</CardLabel>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.7fr_0.7fr_1.2fr]">
          <div>
            <label htmlFor="si-name" className={label}>Name</label>
            <input id="si-name" className={field} placeholder="e.g. Hack Night hoodie" value={draft.name} onChange={set("name")} maxLength={120} />
            {errors.name && <p className="text-refuse mt-1 text-[12px]">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="si-price" className={label}>Price (₹)</label>
            <input id="si-price" className={field} inputMode="decimal" placeholder="450" value={draft.price} onChange={set("price")} />
            {errors.price && <p className="text-refuse mt-1 text-[12px]">{errors.price}</p>}
          </div>
          <div>
            <label htmlFor="si-stock" className={label}>{sized ? "Stock per size" : "Stock"}</label>
            <input id="si-stock" className={field} inputMode="numeric" placeholder="100" value={draft.stock} onChange={set("stock")} />
            {errors.stock && <p className="text-refuse mt-1 text-[12px]">{errors.stock}</p>}
          </div>
          <div>
            <label htmlFor="si-variants" className={label}>Sizes (optional, comma separated)</label>
            <input id="si-variants" className={field} placeholder="S, M, L, XL" value={draft.variants} onChange={set("variants")} />
            {errors.variants && <p className="text-refuse mt-1 text-[12px]">{errors.variants}</p>}
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <span className={label}>Available to</span>
            <RoleChips value={draft.available_roles} onChange={(v) => setDraft((d) => ({ ...d, available_roles: v }))} allLabel="Everyone" />
          </div>
          <div>
            <span className={label}>Free for</span>
            <RoleChips value={draft.free_roles} onChange={(v) => setDraft((d) => ({ ...d, free_roles: v }))} allLabel="Nobody" />
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            Add to store
          </button>
        </div>
      </form>
    </FigurePanel>
  );
}

function ItemRow({ eventId, item }: { eventId: number; item: StoreItem }) {
  const update = useUpdateStoreItem(eventId);
  const remove = useDeleteStoreItem(eventId);
  const [editing, setEditing] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [price, setPrice] = React.useState(String(item.price));
  const [stock, setStock] = React.useState(item.stock === null ? "" : String(item.stock));
  const [sizes, setSizes] = React.useState(item.variants.map((v) => ({ label: v.label, stock: String(v.stock) })));
  const status = !item.on_sale ? { label: "Hidden", tone: undefined } : item.sold_out ? { label: "Sold out", tone: "caution" as const } : { label: "On sale", tone: "admit" as const };
  const save = async () => {
    const patch: Record<string, unknown> = { price: Number(price) };
    if (item.variants.length > 0) patch.variants = sizes.map((s) => ({ label: s.label, stock: Number(s.stock) || 0 }));
    else patch.stock = Number(stock) || 0;
    await update.mutateAsync({ id: item.id, patch });
    setEditing(false);
  };
  return (
    <li className="border-line-soft flex flex-wrap items-center gap-3 border-b py-3 last:border-0">
      <span className="bg-brand-soft text-brand grid size-12 shrink-0 place-items-center rounded-xl">{item.variants.length > 0 ? <ShirtIcon className="size-5" /> : <PackageIcon className="size-5" />}</span>
      <div className="min-w-[180px] flex-1">
        <div className="text-ink text-[14px] font-medium">{item.name}</div>
        <div className="text-ink-3 text-[12px]">{item.variants.length > 0 ? item.variants.map((v) => v.label).join(" · ") : "One size"}</div>
        <div className="text-brand mt-0.5 text-[12px]">{audienceLine(item)}</div>
      </div>
      <div className="w-[220px]">
        <div className="flex justify-between text-[12px]">
          <span className="text-ink">{item.sold} / {item.total} sold</span>
          <span className="text-ink-3">{item.left === 0 ? "none left" : `${item.left} left`}</span>
        </div>
        <ProgressBar value={item.sold} max={Math.max(1, item.total)} tone={item.sold_out ? "caution" : "accent"} height={6} className="mt-1" label={`${item.name} sold`} />
      </div>
      <div className="w-[72px] text-right">
        <div className="text-ink text-[14px] font-medium tabular-nums">{INR.format(item.price)}</div>
        <div className="text-ink-3 text-[11px]">each</div>
      </div>
      <div className="w-[88px] text-right">
        <div className="text-ink text-[14px] font-medium tabular-nums">{INR.format(item.earned)}</div>
        <div className="text-ink-3 text-[11px]">earned</div>
      </div>
      <Chip tone={status.tone}>{status.label}</Chip>
      <input type="checkbox" role="switch" aria-label={`${item.name} on sale`} checked={item.on_sale} disabled={update.isPending} onChange={(e) => update.mutate({ id: item.id, patch: { on_sale: e.target.checked } })} className="accent-[var(--brand)] size-4" />
      <button type="button" className="btn btn-ghost btn-sm" aria-label={`Edit ${item.name}`} onClick={() => setEditing(!editing)}>
        <PencilIcon className="size-4" />
      </button>
      <button
        type="button"
        className={cn("btn btn-ghost btn-sm", confirm && "text-refuse")}
        aria-label={confirm ? `Confirm removing ${item.name}` : `Remove ${item.name}`}
        onClick={() => {
          if (confirm) remove.mutate(item.id);
          setConfirm(!confirm);
        }}
      >
        {confirm ? <span className="text-[12px]">Remove?</span> : <Trash2Icon className="size-4" />}
      </button>
      {editing && (
        <div className="bg-sunken flex w-full flex-wrap items-end gap-2 rounded-xl p-3">
          <div>
            <label htmlFor={`price-${item.id}`} className={label}>Price (₹)</label>
            <input id={`price-${item.id}`} className={cn(field, "w-[110px]")} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          {item.variants.length === 0 ? (
            <div>
              <label htmlFor={`stock-${item.id}`} className={label}>Stock</label>
              <input id={`stock-${item.id}`} className={cn(field, "w-[110px]")} inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
          ) : (
            sizes.map((s, i) => (
              <div key={s.label}>
                <label htmlFor={`stock-${item.id}-${s.label}`} className={label}>{s.label} stock</label>
                <input id={`stock-${item.id}-${s.label}`} className={cn(field, "w-[90px]")} inputMode="numeric" value={s.stock} onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x)))} />
              </div>
            ))
          )}
          <button type="button" className="btn btn-primary" onClick={save} disabled={update.isPending}>
            Save
          </button>
          <button type="button" className="btn btn-ghost" aria-label="Cancel editing" onClick={() => setEditing(false)}>
            <XIcon className="size-4" />
          </button>
        </div>
      )}
    </li>
  );
}

function Sizes({ s }: { s: StoreSummary }) {
  const peak = Math.max(1, ...s.sizes.map((x) => x.sold));
  return (
    <FigurePanel className="p-4">
      <CardLabel right={<span className="text-ink-3 text-[11px]">plan your next print run</span>}>{s.sizes_item ? `${s.sizes_item} · sizes sold` : "Sizes sold"}</CardLabel>
      {s.sizes.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[13px]">No sized item has sold yet.</p>
      ) : (
        <div className="mt-4 flex h-[120px] items-end gap-3">
          {s.sizes.map((x) => (
            <div key={x.label} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-ink text-[12px] tabular-nums">{x.sold}</span>
              <div className="bg-brand w-full max-w-[48px] rounded-t-md" style={{ height: `${Math.max(4, Math.round((x.sold / peak) * 84))}px` }} aria-label={`${x.label}: ${x.sold} sold`} />
              <span className="text-ink-3 text-[12px]">{x.label}</span>
            </div>
          ))}
        </div>
      )}
    </FigurePanel>
  );
}

function Orders({ eventId }: { eventId: number }) {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const orders = useStoreOrders(eventId, { q: q.trim() || undefined, page, page_size: 10 });
  const hand = useHandOver(eventId);
  const data = orders.data;
  return (
    <FigurePanel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <CardLabel>Orders</CardLabel>
        <input aria-label="Find an order" className="input h-8 w-[200px] text-[12.5px]" placeholder="Name, email or ticket" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {!data ? (
        <Skeleton className="m-4 h-24 rounded-xl" />
      ) : data.items.length === 0 ? (
        <p className="text-ink-3 px-4 pb-4 pt-3 text-[13px]">No paid orders yet.</p>
      ) : (
        <ul className="mt-2">
          {data.items.map((o) => (
            <li key={o.id} className="border-line-soft flex flex-wrap items-center gap-3 border-b px-4 py-2.5 last:border-0">
              <span className="text-ink min-w-[140px] flex-1 text-[13.5px] font-medium">{o.guest}</span>
              <span className="text-ink-2 flex-[2] text-[13px]">{o.summary}</span>
              <span className="text-ink w-[80px] text-right text-[13px] tabular-nums">{INR.format(o.total)}</span>
              {o.status === "refunded" ? (
                <Chip tone="refuse">Refunded</Chip>
              ) : o.handed_over_at ? (
                <button type="button" className="text-admit text-[12.5px] font-medium hover:underline" onClick={() => hand.mutate({ orderId: o.id, undo: true })} title="Take the handover back">
                  ✓ Handed over
                </button>
              ) : (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => hand.mutate({ orderId: o.id })} disabled={hand.isPending}>
                  Hand over
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && data.total > 10 && (
        <div className="px-4 pb-3">
          <Pager page={page} pageCount={Math.max(1, Math.ceil(data.total / 10))} total={data.total} pageSize={10} noun={["order", "orders"]} onPage={setPage} />
        </div>
      )}
    </FigurePanel>
  );
}

export function StorePage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const items = useStoreItems(eventId);
  const summary = useStoreSummary(eventId);
  const settings = useStoreSettings(eventId);
  const [adding, setAdding] = React.useState(false);
  const s = summary.data;
  const enabled = s?.enabled ?? Boolean(event.data?.merch_enabled);
  // The store is the plan's `merch`, and the plan caps the items one event sells.
  const merch = useFeatureGate("merch");
  const itemCount = items.data?.length ?? s?.items_total ?? null;
  const itemsCap = useLimitGate("merch_items_per_event", itemCount);
  const add = merch.locked ? merch.prompt : itemsCap.guard(() => setAdding(true));

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">Merchandise</h2>
          <p className="text-ink-2 mt-1 text-[13px]">What this event sells with its tickets · paid once, handed over at the door</p>
        </div>
        {itemCount !== null && !merch.locked ? <LimitMeter limitKey="merch_items_per_event" used={itemCount} /> : null}
      </header>
      <LockedNotice feature="merch" />
      {summary.isError ? (
        <EmptyState tone="muted" title="Could not load the store" description="Try reloading the page." />
      ) : !s ? (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Items on sale" value={`${s.items_on_sale} of ${s.items_total}`} note={s.sold_out > 0 ? `${s.sold_out} sold out` : "none sold out"} />
            <StatTile label="Units sold" value={formatNumber(s.units_sold)} note={`Across ${s.orders_paid} ${s.orders_paid === 1 ? "order" : "orders"}`} />
            <StatTile label="Merch revenue" value={INR.format(s.revenue)} note={`On top of ${INR.format(s.ticket_revenue)} in tickets`} />
            <StatTile label="To hand over" value={formatNumber(s.to_hand_over)} note="Collect at the door" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" role="switch" aria-label="Offer merchandise during registration" checked={enabled} disabled={settings.isPending} onChange={(e) => (e.target.checked && merch.locked ? merch.prompt() : settings.mutate({ merch_enabled: e.target.checked }))} className="accent-[var(--brand)] size-5" />
              <span>
                <span className="text-ink block text-[13.5px] font-medium">Offer merchandise during registration</span>
                <span className="text-ink-3 text-[12px]">Buyers pick items when they register and pay once</span>
              </span>
            </label>
            <button type="button" className="btn btn-secondary text-brand" onClick={add}>
              {merch.locked || itemsCap.locked ? <LockIcon className="size-4" /> : <PlusIcon className="size-4" />} Add item
            </button>
          </div>
          {adding && <NewItem eventId={eventId} onClose={() => setAdding(false)} />}
          <FigurePanel className="px-4 py-1">
            {!items.data ? (
              <Skeleton className="my-3 h-24 rounded-xl" />
            ) : items.data.length === 0 ? (
              <p className="text-ink-3 py-4 text-[13px]">Nothing on the shelf yet. Add the first item: a tee with sizes, a kit, a sticker pack.</p>
            ) : (
              <ul>
                {items.data.map((i) => (
                  <ItemRow key={i.id} eventId={eventId} item={i} />
                ))}
              </ul>
            )}
          </FigurePanel>
          <div className="grid gap-3.5 lg:grid-cols-[1fr_1.6fr]">
            <Sizes s={s} />
            <Orders eventId={eventId} />
          </div>
        </>
      )}
    </div>
  );
}
