"use client";

import * as React from "react";
import { PackageIcon, ShirtIcon } from "lucide-react";
import { Checkbox, Notice, cn } from "@moa/ui";

import { LimitMeter, lockCopy, useLimitGate } from "@/features/plan";

import { leftLine, priceLabel, type ClubStoreItem } from "../schemas";

/**
 * Which of the club's items an event offers: one row each, ticked or not.
 * The order they are ticked in is the order the registration page shows
 * them, and each ticked row says its place. The plan caps how many one
 * event offers (`merch_items_per_event`); at the cap the rows still
 * unticked are shut and the plan's own words say why. A grandfathered
 * event has no cap, as everywhere else.
 */
export function ItemChecklist({ items, value, onChange, eventId, disabled, className }: { items: ClubStoreItem[]; value: string[]; onChange: (ids: string[]) => void; eventId?: number | null; disabled?: boolean; className?: string }) {
  const uid = React.useId();
  // An id the catalogue no longer has (deleted meanwhile) is neither shown nor sent back.
  const chosen = value.filter((id) => items.some((i) => i.id === id));
  const cap = useLimitGate("merch_items_per_event", chosen.length, { eventId });
  const full = cap.locked;
  const copy = full && cap.lock ? lockCopy(cap.lock) : null;
  const toggle = (id: string, on: boolean) => onChange(on ? (chosen.includes(id) ? chosen : [...chosen, id]) : chosen.filter((x) => x !== id));

  return (
    <div className={cn("grid gap-2.5", className)}>
      <ul aria-label="Your merchandise" className="border-line-soft divide-line-soft divide-y overflow-hidden rounded-xl border">
        {items.map((item) => {
          const on = chosen.includes(item.id);
          const place = chosen.indexOf(item.id) + 1;
          const shut = disabled || (!on && full);
          const id = `${uid}-${item.id}`;
          return (
            <li key={item.id} className={cn("flex items-center gap-3 px-3 py-2.5 transition-colors", on ? "bg-brand-soft/40" : "bg-surface", shut && !on && "opacity-60")}>
              <Checkbox id={id} checked={on} disabled={shut} onCheckedChange={(c) => toggle(item.id, c === true)} aria-label={item.name} aria-describedby={`${id}-meta`} className="size-[18px]" />
              <label htmlFor={id} className={cn("flex min-w-0 flex-1 items-center gap-3", shut ? "cursor-not-allowed" : "cursor-pointer")}>
                {item.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.photo_url} alt="" className="border-line-soft size-10 shrink-0 rounded-lg border object-cover" />
                ) : (
                  <span aria-hidden="true" className="bg-sunken text-ink-3 grid size-10 shrink-0 place-items-center rounded-lg">
                    {item.variants.length > 0 ? <ShirtIcon className="size-4" /> : <PackageIcon className="size-4" />}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="text-ink flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium">
                    <span className="truncate">{item.name}</span>
                    {!item.on_sale ? <span className="text-ink-3 bg-sunken rounded-full px-1.5 py-px text-[10.5px] font-normal">Hidden</span> : null}
                  </span>
                  <span id={`${id}-meta`} className="text-ink-3 block truncate text-[12px]">
                    {priceLabel(item.price)} · {leftLine(item)}
                  </span>
                </span>
              </label>
              {on ? (
                <span title="Its place on the registration page" className="bg-brand text-brand-foreground grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold tabular-nums">
                  {place}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink-3 text-[12px]">{chosen.length === 0 ? "Nothing chosen yet." : `${chosen.length} chosen · guests see them in the order you ticked them.`}</span>
        <LimitMeter limitKey="merch_items_per_event" used={chosen.length} eventId={eventId} />
      </div>
      {copy ? (
        <Notice
          tone="caution"
          tag="Plan"
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={cap.prompt}>
              See plans
            </button>
          }
        >
          <strong className="font-semibold">{copy.title}.</strong> {copy.body}
        </Notice>
      ) : null}
    </div>
  );
}
