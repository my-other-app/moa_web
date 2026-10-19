"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDaysIcon, LockIcon, PackageIcon, PencilIcon, PlusIcon, ShirtIcon, ShoppingBagIcon, Trash2Icon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Chip,
  EmptyState,
  FigurePanel,
  Skeleton,
  StatTile,
  buttonVariants,
  cn,
} from "@moa/ui";

import { LockedNotice, useFeatureGate } from "@/features/plan";

import { useClubStore, useDeleteClubItem } from "../queries";
import { INR, audienceLine, eventsLine, joinNames, priceLabel, type ClubStoreItem } from "../schemas";
import { ItemSheet } from "./item-sheet";

/**
 * Merchandise, the club's: every item made once and offered on as many
 * events as the club likes. A few events running at once share a tee, and
 * its stock, rather than each keeping a copy.
 *
 * Four figures across the catalogue; then a card per item with its photo,
 * price, what is left (per size), what it sold and earned everywhere, and
 * the events offering it. Making or changing an item is a sheet; deleting
 * one names the events still offering it first.
 */

function statusOf(item: ClubStoreItem): { label: string; tone?: "admit" | "caution" } {
  if (!item.on_sale) return { label: "Hidden" };
  const soldOut = item.variants.length > 0 ? item.variants.every((v) => v.left <= 0) : item.left <= 0;
  return soldOut ? { label: "Sold out", tone: "caution" } : { label: "On sale", tone: "admit" };
}

function Stock({ item }: { item: ClubStoreItem }) {
  if (item.variants.length === 0) {
    return (
      <p className="text-ink text-[12.5px]">
        <span className={cn("font-medium tabular-nums", item.left <= 0 && "text-refuse")}>{item.left <= 0 ? "None left" : `${formatNumber(item.left)} left`}</span>
        {item.stock !== null ? <span className="text-ink-3"> of {formatNumber(item.stock)}</span> : null}
      </p>
    );
  }
  return (
    <ul aria-label={`${item.name} left by size`} className="flex flex-wrap gap-1.5">
      {item.variants.map((v) => (
        <li key={v.id} className={cn("border-line-soft rounded-md border px-1.5 py-0.5 font-mono text-[11.5px] tabular-nums", v.left <= 0 ? "text-refuse border-refuse-line" : "text-ink-2")}>
          {v.label} <strong className="font-semibold">{v.left}</strong>
        </li>
      ))}
    </ul>
  );
}

function Events({ item }: { item: ClubStoreItem }) {
  const shown = item.events.slice(0, 3);
  const more = item.events.length - shown.length;
  return (
    <div className="text-[12px]">
      <p className="text-ink-2 flex items-center gap-1.5 font-medium">
        <CalendarDaysIcon className="text-ink-3 size-3.5" aria-hidden="true" /> {eventsLine(item.events)}
      </p>
      {shown.length > 0 ? (
        <p className="text-ink-3 mt-0.5 line-clamp-2">
          {shown.map((e, i) => (
            <React.Fragment key={e.id}>
              {i > 0 ? ", " : null}
              <Link href={`/events/${e.id}/store`} className="hover:text-ink underline-offset-2 hover:underline">
                {e.name}
              </Link>
            </React.Fragment>
          ))}
          {more > 0 ? ` and ${more} more` : null}
        </p>
      ) : null}
    </div>
  );
}

function ItemCard({ item, onEdit, onDelete, locked }: { item: ClubStoreItem; onEdit: () => void; onDelete: () => void; locked: boolean }) {
  const status = statusOf(item);
  return (
    <FigurePanel className="flex w-full flex-col overflow-hidden p-0">
      <div className="bg-sunken relative aspect-[16/10]">
        {item.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photo_url} alt="" className="size-full object-cover" />
        ) : (
          <span aria-hidden="true" className="text-ink-3 grid size-full place-items-center">
            {item.variants.length > 0 ? <ShirtIcon className="size-8" /> : <PackageIcon className="size-8" />}
          </span>
        )}
        <span className="absolute top-2.5 left-2.5">
          <Chip tone={status.tone} className="bg-surface h-6 px-2 text-[11px]">
            {status.label}
          </Chip>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-ink m-0 text-[14.5px] font-semibold">{item.name}</h3>
            <span className="text-ink shrink-0 text-[14px] font-semibold tabular-nums">{priceLabel(item.price)}</span>
          </div>
          {item.description ? <p className="text-ink-3 mt-0.5 line-clamp-2 text-[12.5px]">{item.description}</p> : null}
          <p className="text-brand mt-1 text-[12px]">{audienceLine(item)}</p>
        </div>
        <Stock item={item} />
        <dl className="border-line-soft grid grid-cols-2 gap-2 border-t pt-3">
          <div>
            <dt className="eyebrow">Sold</dt>
            <dd className="text-ink m-0 text-[14px] font-medium tabular-nums">{formatNumber(item.sold)}</dd>
          </div>
          <div>
            <dt className="eyebrow">Earned</dt>
            <dd className="text-ink m-0 text-[14px] font-medium tabular-nums">{INR.format(item.earned)}</dd>
          </div>
        </dl>
        <Events item={item} />
        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onEdit} aria-label={`Edit ${item.name}`}>
            {locked ? <LockIcon className="size-3.5" /> : <PencilIcon className="size-3.5" />} Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" danger onClick={onDelete} aria-label={`Delete ${item.name}`}>
            <Trash2Icon className="size-3.5" /> Delete
          </Button>
        </div>
      </div>
    </FigurePanel>
  );
}

function DeleteDialog({ item, onClose, onDeleted }: { item: ClubStoreItem | null; onClose: () => void; onDeleted: () => void }) {
  const remove = useDeleteClubItem();
  const names = item?.events.map((e) => e.name) ?? [];
  return (
    <AlertDialog open={item !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {item?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {names.length > 0 ? `It is still offered on ${joinNames(names)}. Deleting it takes it off ${names.length === 1 ? "that event" : `those ${names.length} events`} too.` : "No event offers it."} Orders already paid for it stay as they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {names.length > 0 ? (
          <ul aria-label="Events still offering it" className="border-line-soft divide-line-soft divide-y rounded-xl border text-[13px]">
            {item!.events.map((e) => (
              <li key={e.id} className="text-ink flex items-center gap-2 px-3 py-2">
                <CalendarDaysIcon className="text-ink-3 size-3.5" aria-hidden="true" /> {e.name}
              </li>
            ))}
          </ul>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "destructive" }))}
            disabled={remove.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (!item) return;
              remove.mutate(
                { id: item.id, name: item.name },
                {
                  onSuccess: () => {
                    onDeleted();
                    onClose();
                  },
                },
              );
            }}
          >
            Delete item
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CataloguePage() {
  const router = useRouter();
  const search = useSearchParams();
  const store = useClubStore();
  const items = store.data;
  const merch = useFeatureGate("merch");
  const [sheet, setSheet] = React.useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [deleting, setDeleting] = React.useState<ClubStoreItem | null>(null);

  // `?item=<id>` opens that item, as the event's Merchandise tab links to it.
  const wanted = search.get("item");
  const [opened, setOpened] = React.useState<string | null>(null);
  if (wanted && wanted !== opened && items) {
    setOpened(wanted);
    if (items.some((i) => i.id === wanted)) setSheet({ open: true, id: wanted });
  } else if (!wanted && opened) {
    setOpened(null);
  }

  const editing = sheet.id ? (items?.find((i) => i.id === sheet.id) ?? null) : null;
  const openNew = merch.guard(() => setSheet({ open: true, id: null }));
  const openEdit = (id: string) => merch.guard(() => setSheet({ open: true, id }))();
  const closeSheet = (open: boolean) => {
    setSheet((s) => ({ ...s, open }));
    if (!open && wanted) router.replace("/merchandise");
  };

  const sold = items?.reduce((n, i) => n + i.sold, 0) ?? 0;
  const earned = items?.reduce((n, i) => n + i.earned, 0) ?? 0;
  const onSale = items?.filter((i) => i.on_sale).length ?? 0;
  const events = new Set(items?.flatMap((i) => i.events.map((e) => e.id)) ?? []).size;

  const addButton = (
    <button type="button" className="btn btn-primary" onClick={openNew}>
      {merch.locked ? <LockIcon className="size-4" /> : <PlusIcon className="size-4" />} Add item
    </button>
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Merchandise</h1>
          <p className="text-ink-3 mt-1 text-[12.5px]">Your club&apos;s items, made once and offered on any event. Events that offer the same item sell from the same stock.</p>
        </div>
        {items && items.length > 0 ? addButton : null}
      </div>

      <LockedNotice feature="merch" />

      {store.isError ? (
        <EmptyState tone="muted" title="Could not load your merchandise" description="Try reloading the page." />
      ) : !items ? (
        <div aria-busy="true" aria-label="Loading your merchandise" className="grid gap-3.5">
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[108px] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[340px] rounded-2xl" />
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <FigurePanel>
          <EmptyState icon={<ShoppingBagIcon />} title="No merchandise yet" description="Add a tee, a kit or a sticker pack once, then offer it on any event: guests pick it when they register and pay with the ticket." action={addButton} />
        </FigurePanel>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Items" value={formatNumber(items.length)} note={`${onSale} on sale`} />
            <StatTile label="Units sold" value={formatNumber(sold)} note="Across every event" />
            <StatTile label="Earned" value={INR.format(earned)} note="From merchandise" />
            <StatTile label="Events offering" value={formatNumber(events)} note={events === 0 ? "Tick items on an event to offer them" : "Share these items' stock"} />
          </div>
          <ul aria-label="Your merchandise" className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <li key={item.id} className="flex">
                <ItemCard item={item} locked={merch.locked} onEdit={() => openEdit(item.id)} onDelete={() => merch.guard(() => setDeleting(item))()} />
              </li>
            ))}
          </ul>
        </>
      )}

      <ItemSheet open={sheet.open} onOpenChange={closeSheet} item={editing} onDelete={(item) => setDeleting(item)} />
      <DeleteDialog item={deleting} onClose={() => setDeleting(null)} onDeleted={() => setSheet({ open: false, id: null })} />
    </div>
  );
}
