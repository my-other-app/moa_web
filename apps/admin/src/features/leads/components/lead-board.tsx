"use client";

import * as React from "react";
import Link from "next/link";
import { formatCurrency, formatDateTime, formatNumber } from "@moa/app-kit";
import { NativeSelect, cn } from "@moa/ui";

import { followUpLabel, leadTypeLabel, useTeamRights } from "@/features/teamwork";

import { STAGES, STAGE_LABEL, byStage, type LeadRow, type Stage } from "../schemas";

function Card({ lead, movable, onDragStart, onMove }: { lead: LeadRow; movable: boolean; onDragStart: () => void; onMove: (to: string) => void }) {
  const fu = lead.next_follow_up;
  return (
    <li
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer?.setData?.("text/plain", String(lead.id));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      data-lead={lead.id}
      className={cn("border-line-soft bg-surface flex flex-col gap-1.5 rounded-xl border p-3 shadow-[0_1px_0_rgb(0_0_0/0.03)]", movable && "cursor-grab active:cursor-grabbing")}
    >
      <Link href={`/teamwork/leads/${lead.id}`} className="text-[13.5px] leading-snug font-medium hover:underline">
        {lead.name}
      </Link>
      <p className="text-ink-3 m-0 text-[12px]">
        {leadTypeLabel(lead.type)}
        {lead.city ? ` · ${lead.city}` : ""}
        {lead.value_inr ? ` · ${formatCurrency(lead.value_inr)}` : ""}
      </p>
      <p className={cn("m-0 text-[12px]", lead.overdue ? "text-refuse font-medium" : fu ? "text-ink-2" : "text-caution")}>
        {fu ? `${followUpLabel(fu.kind)} · ${formatDateTime(fu.due_at)}${lead.overdue ? " · overdue" : ""}` : "No next step"}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-3 truncate text-[11.5px]">{lead.owner?.name ?? "No owner"}</span>
        {movable ? (
          <NativeSelect aria-label={`Move ${lead.name} to`} size="sm" className="h-7 w-auto py-0 text-[11.5px]" value={lead.stage} onChange={(e) => onMove(e.target.value)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The pipeline, a column per stage. A lead its owner (or an admin owner) may
 * move is dragged to another column, or moved with the stage menu on its card
 * (the keyboard's way); `onMove` applies the rules (Lost asks why).
 */
export function LeadBoard({ items, counts, onMove }: { items: readonly LeadRow[]; counts: Record<string, number>; onMove: (lead: LeadRow, to: string) => void }) {
  const rights = useTeamRights();
  const columns = byStage(items);
  const [dragging, setDragging] = React.useState<LeadRow | null>(null);
  const [over, setOver] = React.useState<Stage | null>(null);
  return (
    <div className="scroll-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-2" aria-label="Leads by stage">
      {STAGES.map((stage) => (
        <section
          key={stage}
          aria-label={STAGE_LABEL[stage]}
          data-stage={stage}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            setOver(stage);
          }}
          onDragLeave={() => setOver((s) => (s === stage ? null : s))}
          onDrop={(e) => {
            e.preventDefault();
            const lead = dragging;
            setDragging(null);
            setOver(null);
            if (lead) onMove(lead, stage);
          }}
          className={cn("bg-sunken flex w-[240px] shrink-0 flex-col gap-2 rounded-2xl p-2.5 transition-colors", over === stage && "ring-brand ring-2")}
        >
          <header className="flex items-center justify-between px-1">
            <h3 className={cn("m-0 text-[13px] font-semibold", stage === "won" && "text-admit", stage === "lost" && "text-refuse")}>{STAGE_LABEL[stage]}</h3>
            <span className="text-ink-3 font-mono text-[11px] tabular-nums">{formatNumber(counts[stage] ?? columns[stage].length)}</span>
          </header>
          <ul className="m-0 flex min-h-[80px] list-none flex-col gap-2 p-0">
            {columns[stage].map((lead) => (
              <Card key={lead.id} lead={lead} movable={rights.workLead(lead.owner?.id)} onDragStart={() => setDragging(lead)} onMove={(to) => onMove(lead, to)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
