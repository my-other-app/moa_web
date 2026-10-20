"use client";

import * as React from "react";
import Link from "next/link";
import { ListChecksIcon, LockIcon, PackageIcon, PencilIcon, ShirtIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { CardLabel, Chip, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, FigurePanel, Notice, Pager, ProgressBar, Skeleton, StatTile, cn } from "@moa/ui";

import { ItemChecklist, useClubStore, useEventOffers, useSetEventOffers } from "@/features/catalogue";
import { useEventDetail } from "@/features/events";
import { LimitMeter, LockedNotice, useFeatureGate } from "@/features/plan";

import { useFulfil, useHandOver, useRemoveFromEvent, useStoreItems, useStoreOrders, useStoreSettings, useStoreSummary } from "../queries";
import { ORDER_FILTERS, audienceLine, isSoldOut, type OrderFilter, type StoreItem, type StoreSummary } from "../schemas";

/**
 * Merchandise, as one event sells it.
 *
 * The items are the club's (the Merchandise page); an event chooses which
 * to offer, in order, and every event offering an item sells from its one
 * stock. Five figures for this event, the switch that puts the items on
 * the registration page, the items chosen (what each sold here, what is
 * left across the club, what it earned here), the sizes of the best seller
 * for the next print run, and the orders: who still has to collect, and
 * the oversold ones to settle.
 */
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function OfferRow({ eventId, item, locked, onLocked }: { eventId: number; item: StoreItem; locked: boolean; onLocked: () => void }) {
  const remove = useRemoveFromEvent(eventId);
  const [confirm, setConfirm] = React.useState(false);
  const soldOut = isSoldOut(item);
  const status = !item.on_sale ? { label: "Hidden", tone: undefined } : soldOut ? { label: "Sold out", tone: "caution" as const } : { label: "On sale", tone: "admit" as const };
  const sized = item.variants.length > 0;
  return (
    <li className="border-line-soft flex flex-wrap items-center gap-3 border-b py-3 last:border-0">
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo_url} alt="" className="border-line-soft size-12 shrink-0 rounded-xl border object-cover" />
      ) : (
        <span aria-hidden="true" className="bg-brand-soft text-brand grid size-12 shrink-0 place-items-center rounded-xl">
          {sized ? <ShirtIcon className="size-5" /> : <PackageIcon className="size-5" />}
        </span>
      )}
      <div className="min-w-[180px] flex-1">
        <div className="text-ink text-[14px] font-medium">{item.name}</div>
        <div className="text-ink-3 text-[12px]">{sized ? item.variants.map((v) => v.label).join(" · ") : "One size"}</div>
        <div className="text-brand mt-0.5 text-[12px]">{audienceLine(item)}</div>
      </div>
      <div className="w-[220px]">
        <div className="flex justify-between gap-2 text-[12px]">
          <span className="text-ink">{formatNumber(item.sold)} sold here</span>
          <span className={cn(soldOut ? "text-refuse" : "text-ink-3")} title="Shared by every event that offers it">
            {item.left <= 0 ? "none left" : `${formatNumber(item.left)} left`} · shared
          </span>
        </div>
        {sized ? (
          <div aria-label={`${item.name} left by size`} className="text-ink-3 mt-1 font-mono text-[11px] tabular-nums">
            {item.variants.map((v) => `${v.label} ${v.left}`).join(" · ")}
          </div>
        ) : (
          <ProgressBar value={item.sold} max={Math.max(1, item.sold + item.left)} tone={soldOut ? "caution" : "accent"} height={6} className="mt-1" label={`${item.name}: ${item.sold} sold here, ${item.left} left`} />
        )}
      </div>
      <div className="w-[72px] text-right">
        <div className="text-ink text-[14px] font-medium tabular-nums">{INR.format(item.price)}</div>
        <div className="text-ink-3 text-[11px]">each</div>
      </div>
      <div className="w-[88px] text-right">
        <div className="text-ink text-[14px] font-medium tabular-nums">{INR.format(item.earned)}</div>
        <div className="text-ink-3 text-[11px]">earned here</div>
      </div>
      <Chip tone={status.tone}>{status.label}</Chip>
      <Link href={`/merchandise?item=${encodeURIComponent(item.id)}`} className="btn btn-ghost btn-sm" aria-label={`Edit ${item.name}`} title="Price, stock and photo are the club's: edit them on Merchandise">
        <PencilIcon className="size-3.5" /> Edit
      </Link>
      <button
        type="button"
        className={cn("btn btn-ghost btn-sm", confirm && "text-refuse")}
        disabled={remove.isPending}
        onClick={() => {
          if (locked) return onLocked();
          if (confirm) remove.mutate({ id: item.id, name: item.name });
          setConfirm(!confirm);
        }}
        aria-label={confirm ? `Confirm removing ${item.name} from this event` : `Remove ${item.name} from this event`}
      >
        {confirm ? "Remove it?" : "Remove from this event"}
      </button>
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

const NONE: Record<OrderFilter, string> = {
  "": "No paid orders yet.",
  paid: "No paid orders yet.",
  oversold: "Nothing oversold. Every paid order had its pieces.",
  refunded: "No refunded orders.",
};

function Orders({ eventId, status, onStatus, oversold }: { eventId: number; status: OrderFilter; onStatus: (s: OrderFilter) => void; oversold: number }) {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const orders = useStoreOrders(eventId, { q: q.trim() || undefined, status, page, page_size: 10 });
  const hand = useHandOver(eventId);
  const fulfil = useFulfil(eventId);
  const data = orders.data;
  const pick = (s: OrderFilter) => {
    onStatus(s);
    setPage(1);
  };
  return (
    <FigurePanel id="store-orders" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <CardLabel>Orders</CardLabel>
        <input
          aria-label="Find an order"
          className="input h-8 w-[200px] text-[12.5px]"
          placeholder="Name, email or ticket"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div role="group" aria-label="Show orders" className="flex flex-wrap gap-1.5 px-4 pt-3">
        {ORDER_FILTERS.map((f) => (
          <Chip key={f.value} active={status === f.value} tone={f.value === "oversold" && oversold > 0 ? "caution" : "accent"} onClick={() => pick(f.value)}>
            {f.label}
            {f.value === "oversold" && oversold > 0 ? <span className="font-mono tabular-nums">{oversold}</span> : null}
          </Chip>
        ))}
      </div>
      {!data ? (
        <Skeleton className="m-4 h-24 rounded-xl" />
      ) : data.items.length === 0 ? (
        <p className="text-ink-3 px-4 pt-3 pb-4 text-[13px]">{q.trim() ? "No order matches that." : NONE[status]}</p>
      ) : (
        <ul aria-label="Orders" className="mt-2">
          {data.items.map((o) => (
            <li key={o.id} className="border-line-soft flex flex-wrap items-center gap-3 border-b px-4 py-2.5 last:border-0">
              <span className="text-ink min-w-[140px] flex-1 text-[13.5px] font-medium">{o.guest}</span>
              <span className="text-ink-2 flex-[2] text-[13px]">{o.summary}</span>
              <span className="text-ink w-[80px] text-right text-[13px] tabular-nums">{INR.format(o.total)}</span>
              {o.status === "refunded" ? (
                <Chip tone="refuse">Refunded</Chip>
              ) : o.status === "oversold" ? (
                // Paid when the pieces had gone: the server refuses a handover until it is settled.
                <span className="flex items-center gap-2">
                  <Chip tone="caution">Oversold</Chip>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => fulfil.mutate(o.id)} disabled={fulfil.isPending} aria-label={`Settle ${o.guest}'s order`} title="Once the stock is raised under Merchandise: takes the pieces and makes it a paid order to hand over">
                    Settle
                  </button>
                </span>
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

/** The dialog's insides, mounted each time it opens so it starts from what the event offers now. */
function ChooseBody({ eventId, offered, onDone }: { eventId: number; offered: string[]; onDone: () => void }) {
  const store = useClubStore();
  const offers = useEventOffers(eventId);
  const save = useSetEventOffers(eventId);
  const [picked, setPicked] = React.useState<string[] | null>(null);
  // What the event offers now: its offers, or (when they cannot be read) the items its tab lists.
  const value = picked ?? offers.data?.item_ids ?? (offers.isError ? offered : null);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Choose items</DialogTitle>
        <DialogDescription>Tick the club&apos;s items this event sells, in the order guests should see them. Every event that offers an item sells from its one stock.</DialogDescription>
      </DialogHeader>
      {store.isError ? (
        <p className="text-ink-3 text-[13px]">Could not load your merchandise. Try again in a moment.</p>
      ) : store.isPending || value === null ? (
        <div aria-busy="true" aria-label="Loading your merchandise" className="grid gap-1.5">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : store.data.length === 0 ? (
        <p className="border-line text-ink-2 rounded-xl border border-dashed px-3.5 py-3 text-[13px]">
          No merchandise yet. Add items under{" "}
          <Link href="/merchandise" className="text-brand font-medium hover:underline">
            Merchandise
          </Link>
        </p>
      ) : (
        <div className="max-h-[52vh] overflow-y-auto">
          <ItemChecklist items={store.data} value={value} onChange={setPicked} eventId={eventId} />
        </div>
      )}
      <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-between">
        <Link href="/merchandise" className="text-brand text-[13px] font-medium hover:underline">
          Manage merchandise
        </Link>
        <span className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={picked === null || save.isPending} onClick={() => save.mutate(picked ?? [], { onSuccess: onDone })}>
            Save
          </button>
        </span>
      </DialogFooter>
    </>
  );
}

export function StorePage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const items = useStoreItems(eventId);
  const summary = useStoreSummary(eventId);
  const settings = useStoreSettings(eventId);
  const [choosing, setChoosing] = React.useState(false);
  const [status, setStatus] = React.useState<OrderFilter>("");
  const s = summary.data;
  const enabled = s?.enabled ?? Boolean(event.data?.merch_enabled);
  // The store is the plan's `merch`, and the plan caps the items one event offers;
  // a grandfathered event keeps both, and its meter shows the count without the lock.
  const merch = useFeatureGate("merch", { eventId });
  const itemCount = items.data?.length ?? s?.items_total ?? null;
  const choose = merch.locked ? merch.prompt : () => setChoosing(true);
  const offered = items.data?.map((i) => i.id) ?? [];

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">Merchandise</h2>
          <p className="text-ink-2 mt-1 text-[13px]">The club&apos;s items this event sells with its tickets · paid once, handed over at the door</p>
        </div>
        {itemCount !== null && !merch.locked ? <LimitMeter limitKey="merch_items_per_event" used={itemCount} eventId={eventId} /> : null}
      </header>
      <LockedNotice feature="merch" eventId={eventId} />
      {summary.isError ? (
        <EmptyState tone="muted" title="Could not load the store" description="Try reloading the page." />
      ) : !s ? (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatTile label="Items on sale" value={`${s.items_on_sale} of ${s.items_total}`} note={s.sold_out > 0 ? `${s.sold_out} sold out` : "none sold out"} />
            <StatTile label="Units sold" value={formatNumber(s.units_sold)} note={`Across ${s.orders_paid} ${s.orders_paid === 1 ? "order" : "orders"}`} />
            <StatTile label="Merch revenue" value={INR.format(s.revenue)} note={`On top of ${INR.format(s.ticket_revenue)} in tickets`} />
            <StatTile label="To hand over" value={formatNumber(s.to_hand_over)} note="Collect at the door" />
            <StatTile label="Oversold" value={formatNumber(s.oversold)} note={s.oversold > 0 ? "Paid after the pieces ran out" : "Every order had its pieces"} />
          </div>
          {s.oversold > 0 ? (
            <Notice
              tone="caution"
              tag="Oversold"
              action={
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setStatus("oversold");
                    document.getElementById("store-orders")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Show them
                </button>
              }
            >
              <strong className="font-semibold">
                {s.oversold} {s.oversold === 1 ? "order was" : "orders were"} paid after the pieces ran out.
              </strong>{" "}
              Raise the stock under Merchandise and settle each one, or refund it.
            </Notice>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" role="switch" aria-label="Offer merchandise during registration" checked={enabled} disabled={settings.isPending} onChange={(e) => (e.target.checked && merch.locked ? merch.prompt() : settings.mutate({ merch_enabled: e.target.checked }))} className="accent-[var(--brand)] size-5" />
              <span>
                <span className="text-ink block text-[13.5px] font-medium">Offer merchandise during registration</span>
                <span className="text-ink-3 text-[12px]">Buyers pick items when they register and pay once</span>
              </span>
            </label>
            <span className="flex flex-wrap items-center gap-2">
              <Link href="/merchandise" className="btn btn-ghost">
                Manage merchandise
              </Link>
              <button type="button" className="btn btn-secondary text-brand" onClick={choose}>
                {merch.locked ? <LockIcon className="size-4" /> : <ListChecksIcon className="size-4" />} Choose items
              </button>
            </span>
          </div>
          <FigurePanel className="px-4 py-1">
            {!items.data ? (
              <Skeleton className="my-3 h-24 rounded-xl" />
            ) : items.data.length === 0 ? (
              <p className="text-ink-3 py-4 text-[13px]">
                No items on this event yet.{" "}
                <button type="button" className="text-brand font-medium hover:underline" onClick={choose}>
                  Choose from your merchandise
                </button>
                : a tee with sizes, a kit, a sticker pack.
              </p>
            ) : (
              <ul aria-label="Items on this event">
                {items.data.map((i) => (
                  <OfferRow key={i.id} eventId={eventId} item={i} locked={merch.locked} onLocked={merch.prompt} />
                ))}
              </ul>
            )}
          </FigurePanel>
          <div className="grid gap-3.5 lg:grid-cols-[1fr_1.6fr]">
            <Sizes s={s} />
            <Orders eventId={eventId} status={status} onStatus={setStatus} oversold={s.oversold} />
          </div>
        </>
      )}
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent className="sm:max-w-[600px]">{choosing ? <ChooseBody eventId={eventId} offered={offered} onDone={() => setChoosing(false)} /> : null}</DialogContent>
      </Dialog>
    </div>
  );
}
