"use client";

import * as React from "react";
import { NativeSelect, cn } from "@moa/ui";
import { MinusIcon, PlusIcon, ShoppingBagIcon } from "lucide-react";

import type { GateCatalog } from "../schemas";
import { DoorIconButton } from "./door-kit";

/** The shelf at the desk: a size where there are sizes, a count, and the money to take. */
export type ShelfPicks = Record<string, { qty: number; variant_id: string | null }>;

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function picksToStore(catalog: GateCatalog | undefined, picks: ShelfPicks) {
  if (!catalog) return [];
  const out: { item_id: string; variant_id: string | null; qty: number }[] = [];
  for (const item of catalog.items) {
    const p = picks[item.id];
    if (!p || p.qty <= 0) continue;
    if (item.variants.length > 0 && !p.variant_id) continue;
    out.push({ item_id: item.id, variant_id: item.variants.length > 0 ? p.variant_id : null, qty: p.qty });
  }
  return out;
}

export function picksTotal(catalog: GateCatalog | undefined, picks: ShelfPicks) {
  if (!catalog) return 0;
  return catalog.items.reduce((sum, item) => sum + (picks[item.id]?.qty ?? 0) * item.price, 0);
}

export function ShelfPicker({ catalog, picks, onChange }: { catalog: GateCatalog; picks: ShelfPicks; onChange: (next: ShelfPicks) => void }) {
  if (catalog.items.length === 0) return null;
  const set = (id: string, patch: Partial<ShelfPicks[string]>) => onChange({ ...picks, [id]: { qty: 0, variant_id: null, ...(picks[id] ?? {}), ...patch } });
  const total = picksTotal(catalog, picks);
  return (
    <section aria-label="From the shelf" className="border-line-soft overflow-hidden rounded-[var(--radius-card)] border">
      <div className="bg-sunken border-line-soft flex items-start gap-3 border-b px-4 py-3">
        <ShoppingBagIcon aria-hidden="true" className="text-ink-2 mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-ink text-[14px] font-semibold">From the shelf</p>
          <p className="text-ink-3 text-[12.5px] leading-[1.5]">Take the money at the desk with the fee; the order is recorded as paid and handed over.</p>
        </div>
      </div>
      {catalog.items.map((item) => {
        const p = picks[item.id] ?? { qty: 0, variant_id: null };
        const left = item.variants.length > 0 ? (item.variants.find((v) => v.id === p.variant_id)?.left ?? 10) : (item.left ?? 10);
        const max = Math.max(0, Math.min(10, left));
        return (
          <div key={item.id} className="border-line-soft flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0">
            <span className="min-w-0 flex-1 basis-[140px]">
              <span className="text-ink block text-[15px] font-medium">{item.name}</span>
              <span className="text-ink-3 block font-mono text-[11.5px]">{item.price > 0 ? `${INR.format(item.price)} each` : "Free with the ticket"}</span>
            </span>
            {item.variants.length > 0 ? (
              <NativeSelect aria-label={`${item.name} size`} value={p.variant_id ?? ""} onChange={(e) => set(item.id, { variant_id: e.target.value || null, qty: e.target.value ? Math.max(1, p.qty) : 0 })} className="h-11 w-auto text-[16px]">
                <option value="">Size</option>
                {item.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                    {v.left <= 5 ? ` · ${v.left} left` : ""}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <DoorIconButton label={`One less ${item.name}`} disabled={p.qty === 0} onClick={() => set(item.id, { qty: Math.max(0, p.qty - 1) })}>
                <MinusIcon />
              </DoorIconButton>
              <span aria-label={`${item.name} quantity`} className={cn("min-w-7 text-center font-mono text-[17px] tabular-nums", p.qty > 0 ? "text-ink font-semibold" : "text-ink-3")}>
                {p.qty}
              </span>
              <DoorIconButton label={`One more ${item.name}`} disabled={p.qty >= max || (item.variants.length > 0 && !p.variant_id)} onClick={() => set(item.id, { qty: Math.min(max, p.qty + 1) })}>
                <PlusIcon />
              </DoorIconButton>
            </span>
          </div>
        );
      })}
      {total > 0 ? (
        <div className="bg-brand-soft border-brand-line flex items-center justify-between gap-3 border-t px-4 py-3">
          <span className="text-ink text-[14px] font-medium">Take for merchandise</span>
          <strong className="text-ink font-mono text-[18px] font-semibold tabular-nums">{INR.format(total)}</strong>
        </div>
      ) : null}
    </section>
  );
}
