"use client";

import * as React from "react";
import { Button, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useAdmission, useNumberEveryone, useUpdateAdmission } from "../queries";
import { previewNumber } from "../schemas";

const panel = "rounded-lg border-[0.5px] border-[var(--swatch-grey)]";
const heading = "font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const note = "text-[12px] leading-[1.5] text-muted-foreground";
const control = "h-9 rounded-md border bg-muted/40 px-2.5 text-[13px]";

/** How this event numbers its tickets: a prefix, a padded sequence, the event code. Numbers already given out never change. */
export function AdmissionPanel({ eventId }: { eventId: number }) {
  const admission = useAdmission(eventId);
  const update = useUpdateAdmission(eventId);
  const numberAll = useNumberEveryone(eventId);
  const s = admission.data;
  const [prefix, setPrefix] = React.useState<string | null>(null);
  const [digits, setDigits] = React.useState<number | null>(null);
  if (!s) return null;
  const p = prefix ?? (s.prefix ?? "");
  const d = digits ?? s.digits;
  const preview = previewNumber(p, d, s.include_code, s.code, 1);
  return (
    <section className={cn(panel, "space-y-3 p-4")}>
      <div>
        <p className="text-xl font-medium text-[var(--swatch-ink)]">Admission numbers</p>
        <p className={note}>
          The number a ticket and a card carry beside the scan code: a prefix, a padded sequence, and the event code that keeps two events apart. Numbers already given out are never rewritten; a new format applies to the next ticket. Next: <span className="font-mono text-foreground">{s.next_number}</span>
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[160px_120px_1fr]">
        <label className="space-y-1 text-[12px]">
          Prefix
          <input value={p} onChange={(e) => setPrefix(e.target.value.toUpperCase())} onBlur={() => p !== (s.prefix ?? "") && update.mutate({ prefix: p || null })} placeholder="MOA" maxLength={12} className={cn(control, "w-full font-mono uppercase")} />
        </label>
        <label className="space-y-1 text-[12px]">
          Digits
          <input value={d} inputMode="numeric" onChange={(e) => setDigits(Math.min(8, Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1))))} onBlur={() => d !== s.digits && update.mutate({ digits: d })} className={cn(control, "w-full font-mono")} />
        </label>
        <label className="flex items-end gap-2 pb-2 text-[13px]">
          <input type="checkbox" checked={s.include_code} onChange={(e) => update.mutate({ include_code: e.target.checked })} className="size-4 accent-primary" /> End with the event code ({s.code})
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={note}>
          Reads as <span className="font-mono text-foreground">{preview}</span>
        </span>
        <span className="flex-1" />
        <span className={note}>
          {s.numbered} numbered{s.unnumbered ? ` · ${s.unnumbered} without a number` : ""}
        </span>
        {s.unnumbered ? (
          <Button size="sm" variant="outline" disabled={numberAll.isPending} onClick={() => numberAll.mutate()} className={pressable}>
            Number everyone registered so far ({s.unnumbered})
          </Button>
        ) : null}
      </div>
    </section>
  );
}
