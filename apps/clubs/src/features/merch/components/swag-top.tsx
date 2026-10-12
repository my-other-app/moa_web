"use client";

import * as React from "react";
import Link from "next/link";
import { DoorOpenIcon, GiftIcon, HandshakeIcon, PencilIcon, PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { CardLabel, Chip, EmptyState, FigurePanel, ProgressBar, StatTile, cn } from "@moa/ui";

import { useCreateMerchItem, useDeleteMerchItem, useHandOutByHand } from "../queries";
import { HANDOUT_RULES, whoGetsIt, type MerchItem } from "../schemas";

/**
 * Swag: free giveaways, tracked apart from merchandise for sale. Set who
 * gets each item, then count them out at the door — by scan at the gate,
 * or by hand here with +1 and Undo.
 */
const field = "input h-9 w-full";
const label = "eyebrow mb-1.5 block";
const WHO = [
  { value: "everyone", label: "Everyone who checks in" },
  { value: "first", label: "First arrivals at the door" },
  { value: "winners", label: "Winners only (at results)" },
  { value: "speaker", label: "Speakers & mentors" },
  { value: "staff", label: "Volunteers" },
] as const;

function NewSwag({ eventId, onClose }: { eventId: number; onClose: () => void }) {
  const create = useCreateMerchItem(eventId);
  const [draft, setDraft] = React.useState({ name: "", stock: "", who: "everyone", sponsor: "" });
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    const stock = Number(draft.stock);
    if (!name) return void setError("Name the item");
    if (!Number.isInteger(stock) || stock <= 0) return void setError("How many pieces are there?");
    setError(null);
    const role = draft.who === "speaker" ? "Speaker" : draft.who === "staff" ? "Staff" : null;
    await create.mutateAsync({
      name,
      stock,
      eligibility_field: role ? "role" : null,
      eligibility_value: role,
      handout_rule: draft.who === "first" ? "first_n" : draft.who === "winners" ? "winners" : "door",
      sponsor: draft.sponsor.trim() || null,
    });
    onClose();
  };
  return (
    <FigurePanel className="border-brand-line p-4">
      <form onSubmit={submit} noValidate>
        <CardLabel>New swag item</CardLabel>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.6fr_1.2fr_1fr]">
          <div>
            <label htmlFor="sw-name" className={label}>Item</label>
            <input id="sw-name" className={field} placeholder="e.g. Welcome tote" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} />
          </div>
          <div>
            <label htmlFor="sw-qty" className={label}>Quantity</label>
            <input id="sw-qty" className={field} inputMode="numeric" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
          </div>
          <div>
            <label htmlFor="sw-who" className={label}>Who gets it</label>
            <select id="sw-who" className={cn(field, "py-0")} value={draft.who} onChange={(e) => setDraft({ ...draft, who: e.target.value })}>
              {WHO.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sw-sponsor" className={label}>Sponsor (optional)</label>
            <input id="sw-sponsor" className={field} placeholder="e.g. Kinetic Labs" value={draft.sponsor} onChange={(e) => setDraft({ ...draft, sponsor: e.target.value })} maxLength={120} />
          </div>
        </div>
        {error && <p className="text-refuse mt-2 text-[12px]">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost h-9" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary h-9" disabled={create.isPending}>
            Add swag
          </button>
        </div>
      </form>
    </FigurePanel>
  );
}

function SwagCard({ eventId, item, onEdit }: { eventId: number; item: MerchItem; onEdit: () => void }) {
  const hand = useHandOutByHand(eventId);
  const remove = useDeleteMerchItem(eventId);
  const [confirm, setConfirm] = React.useState(false);
  const left = Math.max(0, item.total - item.handed_out);
  const status = item.handout_rule === "winners" ? { label: "At results", tone: undefined } : item.total > 0 && left === 0 ? { label: "All given", tone: "caution" as const } : { label: "Handing out", tone: "admit" as const };
  return (
    <FigurePanel className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand grid size-11 shrink-0 place-items-center rounded-xl">
          <GiftIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-ink text-[14.5px] font-medium">{item.name}</div>
          <div className="text-ink-3 text-[12px]">{whoGetsIt(item)}</div>
        </div>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>
      <div>
        <div className="flex justify-between text-[12.5px]">
          <span className="text-ink">
            <strong>{formatNumber(item.handed_out)}</strong> of {formatNumber(item.total)} handed out
          </span>
          <span className="text-ink-3">{left} left</span>
        </div>
        <ProgressBar value={item.handed_out} max={Math.max(1, item.total)} tone={left === 0 ? "caution" : "accent"} height={6} className="mt-1" label={`${item.name} handed out`} />
      </div>
      {item.sponsor && (
        <div className="text-ink-2 flex items-center gap-1.5 text-[12px]">
          <HandshakeIcon className="text-brand size-3.5" /> Sponsored by <span className="text-ink font-medium">{item.sponsor}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="btn btn-secondary h-8 text-[12.5px]" onClick={() => hand.mutate({ itemId: item.id })} disabled={hand.isPending || left === 0}>
          <PlusIcon className="size-3.5" /> 1 handed out
        </button>
        <button type="button" className="btn btn-ghost text-brand h-8 px-2 text-[12.5px]" onClick={() => hand.mutate({ itemId: item.id, undo: true })} disabled={hand.isPending || item.manual_handed_out === 0} aria-label={`Undo one for ${item.name}`}>
          <Undo2Icon className="size-3.5" /> Undo
        </button>
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost h-8 px-2" aria-label={`Edit ${item.name}`} onClick={onEdit}>
          <PencilIcon className="size-4" />
        </button>
        <button
          type="button"
          className={cn("btn btn-ghost h-8 px-2", confirm && "text-refuse")}
          aria-label={confirm ? `Confirm removing ${item.name}` : `Remove ${item.name}`}
          onClick={() => {
            if (confirm) remove.mutate({ id: item.id, withCollections: item.collected > 0 });
            setConfirm(!confirm);
          }}
        >
          {confirm ? <span className="text-[12px]">Remove?</span> : <Trash2Icon className="size-4" />}
        </button>
      </div>
    </FigurePanel>
  );
}

export function SwagTop({ eventId, items, onEdit }: { eventId: number; items: MerchItem[]; onEdit: (item: MerchItem) => void }) {
  const [adding, setAdding] = React.useState(false);
  const stock = items.reduce((n, i) => n + i.total, 0);
  const out = items.reduce((n, i) => n + i.handed_out, 0);
  const sponsored = items.filter((i) => i.sponsor).length;
  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">Swag</h2>
          <p className="text-ink-2 mt-1 max-w-[64ch] text-[13px]">Free giveaways — tracked separately from merchandise for sale. Set who gets each item, then count them out at the door.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/gate/${eventId}`} target="_blank" rel="noopener" className="btn btn-ghost h-9">
            <DoorOpenIcon className="size-4" /> Open the gate
          </Link>
          <button type="button" className="btn btn-secondary text-brand h-9" onClick={() => setAdding(true)}>
            <PlusIcon className="size-4" /> Add swag
          </button>
        </div>
      </header>
      {adding && <NewSwag eventId={eventId} onClose={() => setAdding(false)} />}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Swag items" value={items.length} note={sponsored > 0 ? `${sponsored} sponsored` : "none sponsored"} />
        <StatTile label="Pieces in stock" value={formatNumber(stock)} note="Across all items" />
        <StatTile label="Handed out" value={formatNumber(out)} note="So far" />
        <StatTile label="Still to give" value={formatNumber(Math.max(0, stock - out))} note="Keep these at the door" />
      </div>
      {items.length === 0 ? (
        <EmptyState tone="muted" title="Nothing to give out yet" description="Add the first item: a tote for everyone who checks in, a sticker sheet for the first arrivals, a voucher for the winners." />
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((i) => (
            <SwagCard key={i.id} eventId={eventId} item={i} onEdit={() => onEdit(i)} />
          ))}
        </div>
      )}
      <p className="eyebrow pt-2">Rules, sizes and the gate log</p>
    </div>
  );
}
