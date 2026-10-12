"use client";

import * as React from "react";
import { cn } from "@moa/ui";

import type { GateCatalog } from "../schemas";

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
    <div className="rounded-xl border">
      <div className="border-b bg-muted/30 px-3.5 py-2.5">
        <div className="text-[13px] font-medium">From the shelf</div>
        <div className="text-[11.5px] text-muted-foreground">Take the money at the desk with the fee; the order is recorded as paid and handed over.</div>
      </div>
      {catalog.items.map((item) => {
        const p = picks[item.id] ?? { qty: 0, variant_id: null };
        const left = item.variants.length > 0 ? (item.variants.find((v) => v.id === p.variant_id)?.left ?? 10) : (item.left ?? 10);
        const max = Math.max(0, Math.min(10, left));
        return (
          <div key={item.id} className="flex flex-wrap items-center gap-2 border-b px-3.5 py-2.5 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium">{item.name}</span>
              <span className="block font-mono text-[11px] text-muted-foreground">{item.price > 0 ? `${INR.format(item.price)} each` : "Free with the ticket"}</span>
            </span>
            {item.variants.length > 0 ? (
              <select aria-label={`${item.name} size`} value={p.variant_id ?? ""} onChange={(e) => set(item.id, { variant_id: e.target.value || null, qty: e.target.value ? Math.max(1, p.qty) : 0 })} className="h-11 rounded-md border bg-muted/40 px-2 text-[14px]">
                <option value="">Size</option>
                {item.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                    {v.left <= 5 ? ` · ${v.left} left` : ""}
                  </option>
                ))}
              </select>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full border px-1">
              <button type="button" aria-label={`One less ${item.name}`} className="size-9 rounded-full text-[18px]" disabled={p.qty === 0} onClick={() => set(item.id, { qty: Math.max(0, p.qty - 1) })}>
                −
              </button>
              <span aria-label={`${item.name} quantity`} className={cn("min-w-5 text-center font-mono text-[14px]", p.qty > 0 && "font-semibold")}>
                {p.qty}
              </span>
              <button type="button" aria-label={`One more ${item.name}`} className="size-9 rounded-full text-[18px]" disabled={p.qty >= max || (item.variants.length > 0 && !p.variant_id)} onClick={() => set(item.id, { qty: Math.min(max, p.qty + 1) })}>
                +
              </button>
            </span>
          </div>
        );
      })}
      {total > 0 ? (
        <div className="flex items-center justify-between bg-muted/30 px-3.5 py-2.5 text-[13px]">
          <span>Take for merchandise</span>
          <strong className="font-mono">{INR.format(total)}</strong>
        </div>
      ) : null}
    </div>
  );
}
